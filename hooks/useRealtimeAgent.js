"use client";

/**
 * hooks/useRealtimeAgent.js
 *
 * Core custom hook for Gemini Live realtime bidirectional voice agent.
 *
 * Requirements:
 * 1. Exposes:
 *    - state ('idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended' | 'error') derived from real signals
 *    - transcript (merged turns with timestamps & interruption flags)
 *    - toolEvents (function call execution logs)
 *    - latency ({ current, avg, p50, history } from end of user speech to first agent audio chunk)
 *    - micAnalyser & agentAnalyser (Web Audio AnalyserNode instances for visualizers)
 *    - start(), end(), mute()
 * 2. Robust teardown callable anytime without exceptions or memory leaks
 * 3. 10-minute maximum call duration timer
 * 4. One automatic reconnect attempt on unexpected socket drops
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { SYSTEM_INSTRUCTION, toGeminiTools } from "@/lib/agent-config";
import { Pcm16Player } from "@/lib/audio/player";
import {
  AGENT_STATES,
  MAX_CALL_DURATION_MS,
  mergeTurnFragments,
  RealtimeAgentStateMachine,
} from "@/lib/audio/realtime-state";
import {
  createDecisionEvent,
  deriveDecisionEventsFromTool,
  classifyIntent,
  checkTextGuardrails,
  DECISION_KINDS,
} from "@/lib/decision-events";
import {
  SilenceTimer,
  SILENCE_NUDGE_MS,
  SILENCE_ABANDON_MS,
  GOODBYE_AUTO_END_DELAY_MS,
  isGoodbyeIntent,
  isUnclearAudioResponse,
} from "@/lib/call-etiquette";
import { CallRecorder } from "@/lib/audio/call-recorder";
import { saveSessionRecording } from "@/lib/audio/indexeddb-audio";

/**
 * Fast ArrayBuffer to Base64 conversion (8KB chunks)
 */
function bufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const len = bytes.byteLength;
  const CHUNK_SIZE = 8192;
  if (len < CHUNK_SIZE) {
    return btoa(String.fromCharCode.apply(null, bytes));
  }
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function useRealtimeAgent(options = {}) {
  const {
    systemInstruction = SYSTEM_INSTRUCTION,
    tools = null,
    sessionId: userSessionId = null,
    maxCallDurationMs = MAX_CALL_DURATION_MS,
    onLog = null,
    brandId = "aura",
    voice = null,
  } = options;

  // Session ID — deferred to client to avoid hydration mismatch from Math.random()
  const [sessionId, setSessionId] = useState("");
  useEffect(() => {
    const resolved =
      userSessionId ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem("aria_session_id") ||
          localStorage.getItem("aria_session_id")
        : "") ||
      "session-" + Math.random().toString(36).slice(2, 9);
    setSessionId(resolved);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("aria_session_id", resolved);
      } catch {}
    }
  }, [userSessionId]);

  // Exposed React State
  const [state, setState] = useState(AGENT_STATES.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [toolEvents, setToolEvents] = useState([]);
  const [latency, setLatency] = useState({
    current: null,
    avg: null,
    p50: null,
    history: [],
  });
  const [isMuted, setIsMuted] = useState(false);
  const [micAnalyser, setMicAnalyser] = useState(null);
  const [agentAnalyser, setAgentAnalyser] = useState(null);
  const [error, setError] = useState(null);

  // State machine & sync helper
  const smRef = useRef(new RealtimeAgentStateMachine({ maxCallDurationMs }));

  const syncState = useCallback(() => {
    const sm = smRef.current;
    setState(sm.state);
    setLatency(sm.latency);
    setError(sm.error);
  }, []);

  // Audio & WebSocket refs
  const wsRef = useRef(null);
  const playerRef = useRef(null);
  const micContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const micWorkletNodeRef = useRef(null);

  // Mute & lifecycle tracking refs
  const isMutedRef = useRef(false);
  const isIntentionalClosureRef = useRef(false);
  const isConnectingRef = useRef(false);
  const lastUserSpeechTimeRef = useRef(null);

  // Call Etiquette (Task 15): Silence timer, goodbye auto-end, unclear audio
  const [isUnclearAudio, setIsUnclearAudio] = useState(false);
  const unclearAudioTimeoutRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const isGoodbyePendingRef = useRef(false);
  const goodbyeEndTimerRef = useRef(null);
  const callResolutionRef = useRef("RESOLVED");

  const triggerUnclearAudio = useCallback(() => {
    setIsUnclearAudio(true);
    if (unclearAudioTimeoutRef.current) clearTimeout(unclearAudioTimeoutRef.current);
    unclearAudioTimeoutRef.current = setTimeout(() => {
      setIsUnclearAudio(false);
    }, 4000);
  }, []);

  // Call Recording (Task 16): Mixed client audio recording & IndexedDB session cache
  const callRecorderRef = useRef(null);
  const callStartEpochRef = useRef(null);
  const [recording, setRecording] = useState(null);

  const getCallOffsetMs = useCallback(() => {
    return callStartEpochRef.current
      ? Math.max(0, Date.now() - callStartEpochRef.current)
      : 0;
  }, []);

  // Audio generation counter: incremented on each barge-in / interruption.
  // Chunks from a previous generation are discarded.
  const audioGenRef = useRef(0);
  const lastUserSpeechTextRef = useRef("");

  // Timers
  const maxCallTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const fragmentFlushTimerRef = useRef(null);
  const pendingFragmentsQueueRef = useRef([]);

  // Logging helper
  const log = useCallback(
    (source, type, details) => {
      if (typeof onLog === "function") {
        onLog(source, type, details);
      }
    },
    [onLog]
  );

  // Sync mute state & silence timer pause/resume
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) {
      silenceTimerRef.current?.pause();
    } else if (state === AGENT_STATES.LISTENING) {
      silenceTimerRef.current?.resume();
    }
  }, [isMuted, state]);

  // Pause silence timer whenever agent is speaking, thinking, or not listening
  useEffect(() => {
    if (state === AGENT_STATES.LISTENING && !isMutedRef.current) {
      silenceTimerRef.current?.resume();
    } else {
      silenceTimerRef.current?.pause();
    }
  }, [state]);

  // 10 Hz batched transcript flushing (prevents React UI thread starvation)
  useEffect(() => {
    fragmentFlushTimerRef.current = setInterval(() => {
      if (pendingFragmentsQueueRef.current.length > 0) {
        const queue = [...pendingFragmentsQueueRef.current];
        pendingFragmentsQueueRef.current = [];

        setTranscript((prevTurns) => {
          let updated = prevTurns;
          for (const item of queue) {
            updated = mergeTurnFragments(updated, item.speaker, item.fragment, item.options);
          }
          return updated;
        });
      }
    }, 100);

    return () => {
      if (fragmentFlushTimerRef.current) {
        clearInterval(fragmentFlushTimerRef.current);
        fragmentFlushTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Robust teardown callable at any time
   */
  const teardown = useCallback(
    (finalState = AGENT_STATES.ENDED, errorDetail = null) => {
      isIntentionalClosureRef.current = true;
      isConnectingRef.current = false;

      // Synchronously flush any queued transcript fragments so no ending dialogue is lost
      if (pendingFragmentsQueueRef.current && pendingFragmentsQueueRef.current.length > 0) {
        const queue = [...pendingFragmentsQueueRef.current];
        pendingFragmentsQueueRef.current = [];
        setTranscript((prevTurns) => {
          let updated = prevTurns;
          for (const item of queue) {
            updated = mergeTurnFragments(updated, item.speaker, item.fragment, item.options);
          }
          return updated;
        });
      }

      // Clear all timers
      if (maxCallTimerRef.current) {
        clearTimeout(maxCallTimerRef.current);
        maxCallTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (silenceTimerRef.current) {
        silenceTimerRef.current.stop();
      }
      if (goodbyeEndTimerRef.current) {
        clearTimeout(goodbyeEndTimerRef.current);
        goodbyeEndTimerRef.current = null;
      }
      if (unclearAudioTimeoutRef.current) {
        clearTimeout(unclearAudioTimeoutRef.current);
        unclearAudioTimeoutRef.current = null;
      }
      isGoodbyePendingRef.current = false;
      setIsUnclearAudio(false);

      // Finalize client-side audio recording
      if (callRecorderRef.current) {
        const recorder = callRecorderRef.current;
        callRecorderRef.current = null;
        recorder.stop().then((rec) => {
          if (rec) {
            setRecording(rec);
            saveSessionRecording(sessionId || "default-session", rec.blob, {
              durationMs: rec.durationMs,
              mode: "realtime",
            });
            log("Recording", "SAVED", `Recording finalized (${rec.durationMs}ms, ${rec.mimeType})`);
          }
        });
      }

      // Stop mic tracks
      if (micStreamRef.current) {
        try {
          micStreamRef.current.getTracks().forEach((track) => track.stop());
        } catch {}
        micStreamRef.current = null;
      }

      // Disconnect worklet
      if (micWorkletNodeRef.current) {
        try {
          micWorkletNodeRef.current.port.onmessage = null;
          micWorkletNodeRef.current.disconnect();
        } catch {}
        micWorkletNodeRef.current = null;
      }

      // Close mic AudioContext
      if (micContextRef.current && micContextRef.current.state !== "closed") {
        try {
          micContextRef.current.close().catch(() => {});
        } catch {}
        micContextRef.current = null;
      }

      // Stop & close player
      if (playerRef.current) {
        try {
          playerRef.current.onPlaybackEnded = null;
          playerRef.current.stop();
          playerRef.current.close().catch(() => {});
        } catch {}
        playerRef.current = null;
      }

      // Close WebSocket cleanly
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          if (
            wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING
          ) {
            wsRef.current.close(1000, "Clean teardown");
          }
        } catch {}
        wsRef.current = null;
      }

      setMicAnalyser(null);
      setAgentAnalyser(null);

      if (errorDetail) {
        smRef.current.onError(errorDetail);
      } else if (finalState === AGENT_STATES.ENDED) {
        smRef.current.end();
      }
      syncState();
    },
    [syncState]
  );

  // Hook unmount safety
  useEffect(() => {
    return () => {
      teardown(AGENT_STATES.ENDED);
    };
  }, [teardown]);

  /**
   * Send un-gated microphone audio chunk
   */
  const sendAudioChunk = useCallback((pcm16ArrayBuffer) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (isMutedRef.current) return;

    const base64Data = bufferToBase64(pcm16ArrayBuffer);
    const audioMessage = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data,
          },
        ],
      },
    };

    wsRef.current.send(JSON.stringify(audioMessage));
  }, []);

  /**
   * Initialize microphone capture & micAnalyser
   */
  const initMicrophone = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    micStreamRef.current = stream;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const micCtx = new AudioCtx();
    micContextRef.current = micCtx;

    if (micCtx.state === "suspended") {
      await micCtx.resume();
    }

    // Connect mic AnalyserNode
    const analyser = micCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    const sourceNode = micCtx.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    setMicAnalyser(analyser);

    // AudioWorklet setup
    await micCtx.audioWorklet.addModule("/worklets/mic-processor.js");
    const workletNode = new AudioWorkletNode(micCtx, "mic-processor");
    micWorkletNodeRef.current = workletNode;

    sourceNode.connect(workletNode);

    // Keep worklet alive with zero-gain destination
    const silentGain = micCtx.createGain();
    silentGain.gain.value = 0;
    workletNode.connect(silentGain);
    silentGain.connect(micCtx.destination);

    workletNode.port.onmessage = (event) => {
      sendAudioChunk(event.data);
    };

    log("Mic", "ACTIVE", `Microphone streaming @ 16 kHz mono PCM16`);
  }, [sendAudioChunk, log]);

  /**
   * Tool execution loop
   */
  const handleFunctionCalls = useCallback(
    async (functionCalls) => {
      if (!functionCalls || functionCalls.length === 0) return;

      smRef.current.onToolCallStart();
      syncState();
      log("ToolLoop", "TOOL_CALL", functionCalls);

      const functionResponses = await Promise.all(
        functionCalls.map(async (fnCall) => {
          const startTime = performance.now();
          let result = null;
          let durationMs = 0;

          try {
            const toolRes = await fetch(`/api/tools/${encodeURIComponent(fnCall.name)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId,
                brandId,
                args: fnCall.args || {},
              }),
            });

            const toolData = await toolRes.json();
            durationMs = Math.round(performance.now() - startTime);
            result = toolData.ok ? toolData.result : { error: toolData.error };
          } catch (err) {
            durationMs = Math.round(performance.now() - startTime);
            result = { error: err.message };
          }

          const decisionEvents = deriveDecisionEventsFromTool(
            fnCall.name,
            fnCall.args || {},
            result,
            durationMs
          );

          setToolEvents((prev) => [...prev, ...decisionEvents]);
          log("ToolLoop", "TOOL_RESULT", {
            name: fnCall.name,
            durationMs,
            eventsCount: decisionEvents.length,
            resultSummary: result?.found ? `Found ${result.order?.order_id}` : result?.message || result,
          });

          return {
            name: fnCall.name,
            id: fnCall.id,
            response: { result },
          };
        })
      );

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const responsePayload = {
          toolResponse: {
            functionResponses,
          },
        };
        wsRef.current.send(JSON.stringify(responsePayload));
        log("Client -> Server", "TOOL_RESPONSE", responsePayload);
      }

      smRef.current.onToolCallEnd();
      syncState();
    },
    [sessionId, syncState, log]
  );

  /**
   * Internal session connection pipeline
   */
  const connectSession = useCallback(
    async ({ isReconnect = false } = {}) => {
      try {
        isConnectingRef.current = true;
        isIntentionalClosureRef.current = false;

        if (!isReconnect) {
          smRef.current.start();
        }
        syncState();

        // 1. Initialize player & resume AudioContext
        const player = new Pcm16Player({ sampleRate: 24000 });
        await player.resume();
        player.onPlaybackEnded = () => {
          smRef.current.onAgentAudioEnded();
          syncState();

          // Natural closing: auto-end after 2s grace period if goodbye was pending
          if (isGoodbyePendingRef.current) {
            if (goodbyeEndTimerRef.current) clearTimeout(goodbyeEndTimerRef.current);
            goodbyeEndTimerRef.current = setTimeout(() => {
              log("CallEtiquette", "GOODBYE_AUTO_END", "Auto-ending call after 2-second grace following goodbye intent.");
              end("RESOLVED");
            }, GOODBYE_AUTO_END_DELAY_MS);
          }
        };
        playerRef.current = player;
        setAgentAnalyser(player.analyser);
        log("AudioPlayer", "READY", "PCM16 24 kHz playback queue initialized.");

        // 2. Fetch ephemeral token
        log("Client", "FETCH_TOKEN", "Requesting ephemeral token from /api/token...");
        const tokenRes = await fetch("/api/token", { method: "POST" });
        const tokenData = await tokenRes.json();

        if (!tokenRes.ok) {
          teardown(AGENT_STATES.ERROR, {
            code: tokenData.code || "TOKEN_ERROR",
            message: tokenData.error || "Failed to mint ephemeral token",
          });
          return;
        }

        // 3. Connect to WebSocket
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(
          tokenData.token
        )}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = async () => {
          isConnectingRef.current = false;
          log("WebSocket", "OPENED", "Live WebSocket connection established.");

          const effectiveTools = tools || toGeminiTools();
          const modelPath = tokenData.model.startsWith("models/")
            ? tokenData.model
            : `models/${tokenData.model}`;

          const setupMessage = {
            setup: {
              model: modelPath,
              generationConfig: {
                responseModalities: ["AUDIO"],
              },
              systemInstruction: {
                parts: [{ text: systemInstruction }],
              },
              tools: effectiveTools,
              realtimeInputConfig: {
                activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
                automaticActivityDetection: {
                  disabled: false,
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          };

          ws.send(JSON.stringify(setupMessage));
          log("Client -> Server", "SETUP", {
            model: modelPath,
            activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
          });

          // Start mic
          await initMicrophone();
          smRef.current.onSetupComplete();
          syncState();

          // Reset recording & set call start timestamp for per-turn offset tracking
          callStartEpochRef.current = Date.now();
          setRecording(null);

          // Initialize client-side mixed audio recorder (Mic + Aria 24kHz)
          try {
            const recorder = new CallRecorder({
              audioContext: micContextRef.current,
              micStream: micStreamRef.current,
              player: playerRef.current,
              mode: "realtime",
            });
            if (recorder.start()) {
              callRecorderRef.current = recorder;
              log("Recording", "STARTED", "Mixed audio recorder active (Mic + Aria 24kHz)");
            }
          } catch (recErr) {
            console.warn("[useRealtimeAgent] CallRecorder start failed:", recErr);
          }

          // Initialize client-side silence timer
          silenceTimerRef.current = new SilenceTimer({
            nudgeDelayMs: SILENCE_NUDGE_MS,
            abandonDelayMs: SILENCE_ABANDON_MS,
            onNudge: () => {
              if (isMutedRef.current) return;
              if (smRef.current.state !== AGENT_STATES.LISTENING) return;
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

              log("SilenceTimer", "NUDGE", "8s customer silence while listening. Sending nudge turn.");
              wsRef.current.send(
                JSON.stringify({
                  clientContent: {
                    turns: [
                      {
                        role: "user",
                        parts: [
                          {
                            text: "[System note: The customer has been silent for 8 seconds. Please check in with a short, polite: \"Are you still there?\"]",
                          },
                        ],
                      },
                    ],
                    turnComplete: true,
                  },
                })
              );
            },
            onAbandon: () => {
              if (isMutedRef.current) return;
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

              log("SilenceTimer", "ABANDON", "15s post-nudge silence (23s total). Saying polite goodbye and ending as ABANDONED.");
              callResolutionRef.current = "ABANDONED";

              wsRef.current.send(
                JSON.stringify({
                  clientContent: {
                    turns: [
                      {
                        role: "user",
                        parts: [
                          {
                            text: "[System note: The customer has remained silent for 23 seconds. Say a short, polite goodbye (e.g. \"It looks like we got disconnected. Feel free to call back anytime. Goodbye!\").]",
                          },
                        ],
                      },
                    ],
                    turnComplete: true,
                  },
                })
              );

              // Auto-end after a short grace allowing goodbye delivery
              setTimeout(() => {
                end("ABANDONED");
              }, 3500);
            },
          });
          silenceTimerRef.current.start();

          // 10-minute max call timer
          if (maxCallTimerRef.current) clearTimeout(maxCallTimerRef.current);
          maxCallTimerRef.current = setTimeout(() => {
            log("CallTimer", "TIMEOUT", "10-minute maximum call duration reached.");
            smRef.current.onCallTimeout();
            teardown(AGENT_STATES.ENDED);
          }, maxCallDurationMs);
        };

        ws.onmessage = async (event) => {
          let rawText = event.data;
          if (typeof event.data === "object" && event.data instanceof Blob) {
            rawText = await event.data.text();
          }

          try {
            const parsed = JSON.parse(rawText);

            // Setup complete confirmation
            if (parsed.setupComplete) {
              smRef.current.onSetupComplete();
              syncState();
              return;
            }

            // Function calls
            if (parsed.toolCall?.functionCalls) {
              await handleFunctionCalls(parsed.toolCall.functionCalls);
              return;
            }

            // Server content
            if (parsed.serverContent) {
              const sc = parsed.serverContent;

              // Barge-in: on interrupted signal, immediately stop playback,
              // bump the generation counter so any in-flight audio chunks are
              // discarded, and mark the aria turn as interrupted.
              if (sc.interrupted) {
                console.log("[barge-in] interrupted — gen", audioGenRef.current, "->" , audioGenRef.current + 1);
                audioGenRef.current++;
                if (playerRef.current) {
                  // Suppress the onPlaybackEnded callback from the stop() call
                  // since onInterrupted already handles the state transition.
                  playerRef.current.onPlaybackEnded = null;
                  playerRef.current.stop();
                  // Restore the callback for future playback
                  playerRef.current.onPlaybackEnded = () => {
                    smRef.current.onAgentAudioEnded();
                    syncState();
                  };
                }
                smRef.current.onInterrupted();
                syncState();

                // Interruption resets silence timer and cancels any pending auto-end
                silenceTimerRef.current?.reset();
                if (goodbyeEndTimerRef.current) {
                  clearTimeout(goodbyeEndTimerRef.current);
                  goodbyeEndTimerRef.current = null;
                  isGoodbyePendingRef.current = false;
                }

                pendingFragmentsQueueRef.current.push({
                  speaker: "aria",
                  fragment: "",
                  options: { complete: true, interrupted: true },
                });

                // Emit BARGE_IN decision event for live telemetry and Scenario 8 detection
                const bargeEvent = createDecisionEvent({
                  kind: "BARGE_IN",
                  title: "Barge-in Interruption Detected",
                  detail: "Agent speech immediately aborted upon user voice activity.",
                  ruleCited: "BARGE_IN: START_OF_ACTIVITY_INTERRUPTS",
                  status: "active",
                  isBargeIn: true,
                });
                setToolEvents((prev) => [...prev, bargeEvent]);
                return;
              }

              // User speech transcription fragment
              if (sc.inputTranscription?.text) {
                const textFrag = sc.inputTranscription.text;
                lastUserSpeechTextRef.current += (lastUserSpeechTextRef.current ? " " : "") + textFrag;
                lastUserSpeechTimeRef.current = performance.now();
                smRef.current.onUserSpeechStart();
                syncState();

                // Any user speech resets silence timer and cancels pending goodbye end
                silenceTimerRef.current?.reset();
                if (goodbyeEndTimerRef.current) {
                  clearTimeout(goodbyeEndTimerRef.current);
                  goodbyeEndTimerRef.current = null;
                }

                pendingFragmentsQueueRef.current.push({
                  speaker: "user",
                  fragment: textFrag,
                  options: { offsetMs: getCallOffsetMs() },
                });
              }

              // Model output transcription fragment
              if (sc.outputTranscription?.text) {
                const textFrag = sc.outputTranscription.text;
                if (isUnclearAudioResponse(textFrag)) {
                  triggerUnclearAudio();
                }
                pendingFragmentsQueueRef.current.push({
                  speaker: "aria",
                  fragment: textFrag,
                  options: { offsetMs: getCallOffsetMs() },
                });
              }

              // Model turn parts (audio, nested tool calls, text)
              if (sc.modelTurn?.parts) {
                // Capture the current generation so in-flight chunks from an
                // interrupted turn are discarded.
                const gen = audioGenRef.current;
                const nestedCalls = [];

                for (const part of sc.modelTurn.parts) {
                  if (part.functionCall) {
                    nestedCalls.push(part.functionCall);
                  }

                  if (part.inlineData?.data) {
                    // Discard audio from a previous (interrupted) generation
                    if (audioGenRef.current !== gen) {
                      console.log("[barge-in] discarding stale audio chunk");
                      continue;
                    }
                    // Record per-turn latency to first audio chunk
                    smRef.current.onAgentAudioChunk(performance.now());
                    syncState();

                    playerRef.current?.queueChunk(part.inlineData.data);
                  }

                  if (part.text) {
                    if (isUnclearAudioResponse(part.text)) {
                      triggerUnclearAudio();
                    }
                    pendingFragmentsQueueRef.current.push({
                      speaker: "aria",
                      fragment: part.text,
                      options: { offsetMs: getCallOffsetMs() },
                    });
                  }
                }

                if (nestedCalls.length > 0) {
                  await handleFunctionCalls(nestedCalls);
                }
              }

              // Turn complete
              if (sc.turnComplete) {
                // Check if completed user utterance triggered safety guardrails, policy limits, or goodbye intent
                if (lastUserSpeechTextRef.current) {
                  if (isGoodbyeIntent(lastUserSpeechTextRef.current)) {
                    isGoodbyePendingRef.current = true;
                    log("CallEtiquette", "GOODBYE_DETECTED", lastUserSpeechTextRef.current);
                  } else {
                    isGoodbyePendingRef.current = false;
                  }

                  const guard = checkTextGuardrails(lastUserSpeechTextRef.current);
                  if (guard) {
                    setToolEvents((prev) => [...prev, guard]);
                  }
                  lastUserSpeechTextRef.current = "";
                }

                // If user speech timestamp was recorded, mark end of user speech
                if (lastUserSpeechTimeRef.current !== null) {
                  smRef.current.onUserSpeechEnd(lastUserSpeechTimeRef.current);
                  lastUserSpeechTimeRef.current = null;
                  syncState();
                }

                pendingFragmentsQueueRef.current.push({
                  speaker: "aria",
                  fragment: "",
                  options: { complete: true },
                });
              }
            }
          } catch (err) {
            log("Server -> Client", "PARSE_ERROR", err.message);
          }
        };

        ws.onerror = (err) => {
          log("WebSocket", "ERROR", err?.message || "WebSocket encountered an error");
        };

        ws.onclose = (event) => {
          log("WebSocket", "CLOSED", `Code: ${event.code}, Reason: ${event.reason || "None"}`);

          if (isIntentionalClosureRef.current) {
            smRef.current.end();
            syncState();
            return;
          }

          // Automatic reconnect on unexpected drop
          const dropResult = smRef.current.onSocketDropped(event.code, event.reason);
          syncState();

          if (dropResult?.shouldReconnect) {
            log("WebSocket", "RECONNECTING", "Unexpected drop. Attempting 1 automatic reconnect in 500ms...");
            teardown(AGENT_STATES.CONNECTING);
            reconnectTimerRef.current = setTimeout(() => {
              connectSession({ isReconnect: true });
            }, 500);
          } else {
            teardown(AGENT_STATES.ERROR, smRef.current.error);
          }
        };
      } catch (err) {
        log("Client", "ERROR", `Connection initialization error: ${err.message}`);
        teardown(AGENT_STATES.ERROR, { message: err.message });
      }
    },
    [systemInstruction, tools, maxCallDurationMs, syncState, log, initMicrophone, handleFunctionCalls, teardown]
  );

  /**
   * Start session
   */
  const start = useCallback(async () => {
    if (isConnectingRef.current || wsRef.current) return;
    await connectSession();
  }, [connectSession]);

  /**
   * End session
   */
  const end = useCallback(
    (resolution = "RESOLVED") => {
      callResolutionRef.current = resolution;
      teardown(AGENT_STATES.ENDED);
    },
    [teardown]
  );

  /**
   * Toggle or set mute
   */
  const mute = useCallback((forceValue) => {
    setIsMuted((prev) => {
      const next = typeof forceValue === "boolean" ? forceValue : !prev;
      isMutedRef.current = next;
      return next;
    });
  }, []);

  /**
   * Send user message (used by test harness)
   */
  const sendUserMessage = useCallback(
    (text) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const clean = String(text || "").trim();
      if (!clean) return;

      // Reset silence timer on user input
      silenceTimerRef.current?.reset();
      if (goodbyeEndTimerRef.current) {
        clearTimeout(goodbyeEndTimerRef.current);
        goodbyeEndTimerRef.current = null;
      }

      if (isGoodbyeIntent(clean)) {
        isGoodbyePendingRef.current = true;
        log("CallEtiquette", "GOODBYE_DETECTED", clean);
      } else {
        isGoodbyePendingRef.current = false;
      }

      // Mark end of user speech for latency measurement
      smRef.current.onUserSpeechEnd(performance.now());
      syncState();

      // Add to transcript
      pendingFragmentsQueueRef.current.push({
        speaker: "user",
        fragment: clean,
        options: { complete: true, offsetMs: getCallOffsetMs() },
      });

      wsRef.current.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [{ text: clean }],
              },
            ],
            turnComplete: true,
          },
        })
      );
      log("Client -> Server", "USER_MESSAGE", clean);

      // Check text guardrails on typed/injected user message
      const guard = checkTextGuardrails(clean);
      if (guard) {
        setToolEvents((prev) => [...prev, guard]);
      }
    },
    [syncState, log]
  );

  /**
   * Trigger barge-in interrupt (used by test harness)
   */
  const interrupt = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Reset silence timer on barge-in
    silenceTimerRef.current?.reset();
    if (goodbyeEndTimerRef.current) {
      clearTimeout(goodbyeEndTimerRef.current);
      goodbyeEndTimerRef.current = null;
      isGoodbyePendingRef.current = false;
    }

    audioGenRef.current++;
    if (playerRef.current) {
      playerRef.current.onPlaybackEnded = null;
      playerRef.current.stop();
      playerRef.current.onPlaybackEnded = () => {
        smRef.current.onAgentAudioEnded();
        syncState();
      };
    }
    smRef.current.onInterrupted();
    syncState();

    pendingFragmentsQueueRef.current.push({
      speaker: "aria",
      fragment: "",
      options: { complete: true, interrupted: true },
    });

    const bargeEvent = createDecisionEvent({
      kind: "BARGE_IN",
      title: "Barge-in Interruption Detected",
      detail: "User triggered barge-in interrupt; audio playback cut off immediately.",
      ruleCited: "BARGE_IN: START_OF_ACTIVITY_INTERRUPTS",
      status: "active",
      isBargeIn: true,
    });
    setToolEvents((prev) => [...prev, bargeEvent]);

    log("BargeIn", "INTERRUPT_TRIGGER", "User triggered barge-in.");
  }, [syncState, log]);

  const detectedIntent = useMemo(() => {
    return classifyIntent(transcript, toolEvents);
  }, [transcript, toolEvents]);

  const clearToolEvents = useCallback(() => {
    setToolEvents([]);
  }, []);

  return {
    state,
    transcript,
    toolEvents,
    detectedIntent,
    clearToolEvents,
    latency,
    micAnalyser,
    agentAnalyser,
    isMuted,
    isUnclearAudio,
    callResolution: callResolutionRef.current,
    recording,
    error,
    start,
    end,
    mute,
    sendUserMessage,
    interrupt,
    sessionId,
  };
}
