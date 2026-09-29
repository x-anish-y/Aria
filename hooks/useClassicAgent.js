"use client";

/**
 * hooks/useClassicAgent.js — Fallback Voice Agent Hook
 *
 * Implements the Classic Voice Mode using:
 * 1. STT: Browser SpeechRecognition (continuous, interimResults, lang en-IN, auto-restarts on end)
 * 2. LLM: POST /api/chat with streaming SSE tokens & server-side tool execution
 * 3. TTS: Sentence-level streaming with speechSynthesis (prefer en-IN voice)
 * 4. Barge-in: Cancels speech synthesis & aborts in-flight request when user speaks
 * 5. Visualizer: AnalyserNode on mic getUserMedia and agent AnalyserNode
 * 6. Graceful degradation: Feature detection for SpeechRecognition with typed text fallback
 *
 * Exposes the EXACT SAME interface as useRealtimeAgent:
 * {
 *   state, transcript, toolEvents, latency, micAnalyser, agentAnalyser,
 *   isMuted, error, unsupportedReason, start, end, mute, sendUserMessage, interrupt, sessionId
 * }
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { SYSTEM_INSTRUCTION } from "@/lib/agent-config";
import {
  AGENT_STATES,
  MAX_CALL_DURATION_MS,
  calculateAvg,
  calculateP50,
  mergeTurnFragments,
} from "@/lib/audio/realtime-state";
import {
  createDecisionEvent,
  deriveDecisionEventsFromTool,
  classifyIntent,
  checkTextGuardrails,
  DECISION_KINDS,
} from "@/lib/decision-events";
import {
  extractSentences,
  findBestSpeechSynthesisVoice,
} from "@/lib/audio/sentence-stream";
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

export function useClassicAgent(options = {}) {
  const {
    systemInstruction = SYSTEM_INSTRUCTION,
    sessionId: userSessionId = null,
    maxCallDurationMs = MAX_CALL_DURATION_MS,
    onLog = null,
    brandId = "aura",
  } = options;

  // Session ID
  const [sessionId, setSessionId] = useState("");
  useEffect(() => {
    const resolved =
      userSessionId ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem("aria_session_id") ||
          localStorage.getItem("aria_session_id")
        : "") ||
      "classic-" + Math.random().toString(36).slice(2, 9);
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
  const [unsupportedReason, setUnsupportedReason] = useState(null);

  // References
  const stateRef = useRef(AGENT_STATES.IDLE);
  stateRef.current = state;

  const isMutedRef = useRef(false);
  const recognitionRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const agentOscillatorRef = useRef(null);
  const abortControllerRef = useRef(null);
  const maxCallTimerRef = useRef(null);
  const silenceTimerRef = useRef(null);

  // Call Etiquette (Task 15)
  const [isUnclearAudio, setIsUnclearAudio] = useState(false);
  const unclearAudioTimeoutRef = useRef(null);
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

  // Call Recording (Task 16): Mic-only client audio recording & IndexedDB session cache
  const callRecorderRef = useRef(null);
  const callStartEpochRef = useRef(null);
  const [recording, setRecording] = useState(null);

  const getCallOffsetMs = useCallback(() => {
    return callStartEpochRef.current
      ? Math.max(0, Date.now() - callStartEpochRef.current)
      : 0;
  }, []);

  // Sync mute state & silence timer pause/resume
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) {
      silenceTimerRef.current?.pause();
    } else if (state === AGENT_STATES.LISTENING) {
      silenceTimerRef.current?.resume();
    }
  }, [isMuted, state]);

  useEffect(() => {
    if (state === AGENT_STATES.LISTENING && !isMutedRef.current) {
      silenceTimerRef.current?.resume();
    } else {
      silenceTimerRef.current?.pause();
    }
  }, [state]);

  // Conversation history for /api/chat
  const conversationHistoryRef = useRef([]);

  // TTS Speech Queue
  const speechQueueRef = useRef([]);
  const isSpeakingSentenceRef = useRef(false);
  const isStreamCompleteRef = useRef(false);
  const turnStartTimeRef = useRef(null);
  const latencyRecordedForTurnRef = useRef(false);

  // Audio generation tracker for barge-in
  const generationRef = useRef(0);

  // Logging helper
  const log = useCallback(
    (source, type, details) => {
      if (typeof onLog === "function") {
        try {
          onLog(source, type, details);
        } catch {}
      }
    },
    [onLog]
  );

  // Update latency helper
  const recordTurnLatency = useCallback(() => {
    if (latencyRecordedForTurnRef.current || !turnStartTimeRef.current) return;
    latencyRecordedForTurnRef.current = true;
    const elapsed = Math.round(performance.now() - turnStartTimeRef.current);
    setLatency((prev) => {
      const nextHistory = [...prev.history, elapsed];
      return {
        current: elapsed,
        avg: calculateAvg(nextHistory),
        p50: calculateP50(nextHistory),
        history: nextHistory,
      };
    });
    log("Metrics", "LATENCY", `${elapsed} ms (user speech end -> first agent speech)`);
  }, [log]);

  /**
   * Stop all active speech synthesis and flush the queue (Barge-in / Teardown)
   */
  const stopSpeechSynthesis = useCallback(() => {
    generationRef.current++;
    speechQueueRef.current = [];
    isSpeakingSentenceRef.current = false;
    isStreamCompleteRef.current = false;

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /**
   * Speak next sentence in queue
   */
  const processSpeechQueue = useCallback(() => {
    if (isSpeakingSentenceRef.current) return;
    if (speechQueueRef.current.length === 0) {
      if (isStreamCompleteRef.current && stateRef.current === AGENT_STATES.SPEAKING) {
        setState(AGENT_STATES.LISTENING);
        log("Agent", "STATE_CHANGE", AGENT_STATES.LISTENING);

        // Natural closing: auto-end after 2-second grace if goodbye was pending
        if (isGoodbyePendingRef.current) {
          if (goodbyeEndTimerRef.current) clearTimeout(goodbyeEndTimerRef.current);
          goodbyeEndTimerRef.current = setTimeout(() => {
            log("CallEtiquette", "GOODBYE_AUTO_END", "Classic closing auto-ended after 2s grace");
            end("RESOLVED");
          }, GOODBYE_AUTO_END_DELAY_MS);
        }
      }
      return;
    }

    const nextSentence = speechQueueRef.current.shift();
    if (!nextSentence || !nextSentence.trim()) {
      processSpeechQueue();
      return;
    }

    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    const currentGen = generationRef.current;
    const utterance = new SpeechSynthesisUtterance(nextSentence);

    // Prefer Indian English voice
    const voices = window.speechSynthesis.getVoices();
    const bestVoice = findBestSpeechSynthesisVoice(voices);
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      if (generationRef.current !== currentGen) return;
      isSpeakingSentenceRef.current = true;
      setState(AGENT_STATES.SPEAKING);
      recordTurnLatency();
      log("TTS", "SPEAK_START", nextSentence);
    };

    utterance.onend = () => {
      if (generationRef.current !== currentGen) return;
      isSpeakingSentenceRef.current = false;
      log("TTS", "SPEAK_END", nextSentence);
      processSpeechQueue();
    };

    utterance.onerror = (e) => {
      isSpeakingSentenceRef.current = false;
      if (e.error !== "canceled" && e.error !== "interrupted") {
        log("TTS", "SPEAK_ERROR", e.error);
        processSpeechQueue();
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [log, recordTurnLatency]);

  /**
   * Enqueue a sentence to be spoken
   */
  const queueSentence = useCallback(
    (sentence) => {
      speechQueueRef.current.push(sentence);
      processSpeechQueue();
    },
    [processSpeechQueue]
  );

  /**
   * Barge-in handler: called when user speaks while agent is thinking or speaking
   */
  const interrupt = useCallback(() => {
    log("BargeIn", "TRIGGERED", "User interrupted agent");

    // Cancel TTS & queue
    stopSpeechSynthesis();

    // Reset silence timer on barge-in
    silenceTimerRef.current?.reset();
    if (goodbyeEndTimerRef.current) {
      clearTimeout(goodbyeEndTimerRef.current);
      goodbyeEndTimerRef.current = null;
      isGoodbyePendingRef.current = false;
    }

    // Abort active fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Mark last Aria turn as interrupted
    setTranscript((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.speaker === "aria") {
        return [
          ...prev.slice(0, -1),
          { ...last, isComplete: true, isInterrupted: true },
        ];
      }
      return prev;
    });

    // Emit BARGE_IN decision event for live telemetry and Scenario 8 detection
    const bargeEvent = createDecisionEvent({
      kind: "BARGE_IN",
      title: "Barge-in Interruption Detected",
      detail: "Speech synthesis stopped immediately upon user voice activity.",
      ruleCited: "BARGE_IN: User voice activity cut-off",
      status: "active",
      isBargeIn: true,
    });
    setToolEvents((prev) => [...prev, bargeEvent]);

    if (stateRef.current !== AGENT_STATES.ENDED && stateRef.current !== AGENT_STATES.ERROR) {
      setState(AGENT_STATES.LISTENING);
    }
  }, [log, stopSpeechSynthesis]);

  /**
   * Dispatch user text into chat loop (STT final utterance or typed fallback)
   */
  const sendUserMessage = useCallback(
    async (text, { isSystemNudge = false } = {}) => {
      const cleanText = String(text || "").trim();
      if (!cleanText) return;

      // Reset silence timer and cancel any pending goodbye auto-end
      silenceTimerRef.current?.reset();
      if (goodbyeEndTimerRef.current) {
        clearTimeout(goodbyeEndTimerRef.current);
        goodbyeEndTimerRef.current = null;
      }

      // Check goodbye intent on customer utterances
      if (!isSystemNudge) {
        if (isGoodbyeIntent(cleanText)) {
          isGoodbyePendingRef.current = true;
          log("CallEtiquette", "GOODBYE_DETECTED", cleanText);
        } else {
          isGoodbyePendingRef.current = false;
        }
      }

      // If agent was speaking or thinking, interrupt first
      if (
        stateRef.current === AGENT_STATES.SPEAKING ||
        stateRef.current === AGENT_STATES.THINKING
      ) {
        interrupt();
      }

      // Check text guardrails on user utterance
      const guard = checkTextGuardrails(cleanText);
      if (guard) {
        setToolEvents((prev) => [...prev, guard]);
      }

      // Add user turn to transcript (omit raw bracketed prompt for system nudges)
      if (!isSystemNudge) {
        const timestamp = new Date().toLocaleTimeString();
        setTranscript((prev) =>
          mergeTurnFragments(prev, "user", cleanText, {
            complete: true,
            timestamp,
            offsetMs: getCallOffsetMs(),
          })
        );
      }

      // Transition to THINKING
      setState(AGENT_STATES.THINKING);
      log("Agent", "STATE_CHANGE", AGENT_STATES.THINKING);

      // Start turn latency timer
      turnStartTimeRef.current = performance.now();
      latencyRecordedForTurnRef.current = false;
      isStreamCompleteRef.current = false;

      // Prepare conversation messages
      conversationHistoryRef.current.push({
        role: "user",
        content: cleanText,
      });

      // Abort any prior fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let sentenceBuffer = "";
      let accumulatedResponse = "";

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: conversationHistoryRef.current,
            sessionId,
            brandId,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error || `Server responded with ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue;

            let parsed;
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue;
            }

            // Handle tool events
            if (parsed.type === "tool_event" && parsed.event) {
              setToolEvents((prev) => [...prev, parsed.event]);
              log("ToolLoop", "TOOL_EVENT", parsed.event);
            }

            // Handle streaming tokens
            if (parsed.type === "token" && parsed.token) {
              accumulatedResponse += parsed.token;
              sentenceBuffer += parsed.token;

              // Update transcript with agent text live
              setTranscript((prev) =>
                mergeTurnFragments(prev, "aria", parsed.token, {
                  timestamp: new Date().toLocaleTimeString(),
                  offsetMs: getCallOffsetMs(),
                })
              );

              // Split into sentences for speech
              const { sentences, leftover } = extractSentences(sentenceBuffer, false);
              sentenceBuffer = leftover;

              for (const sentence of sentences) {
                queueSentence(sentence);
              }
            }

            // Handle real-time tool event streaming
            if (parsed.type === "tool_event" && parsed.event) {
              const derived = deriveDecisionEventsFromTool(
                parsed.event.name,
                parsed.event.args || {},
                parsed.event.result || {},
                parsed.event.durationMs || 0
              );
              setToolEvents((prev) => [...prev, ...derived]);
            }

            // Handle completion
            if (parsed.type === "done") {
              if (Array.isArray(parsed.toolEvents)) {
                setToolEvents((prev) => {
                  const existingIds = new Set(prev.map((e) => e.id));
                  const newEvents = [];
                  for (const te of parsed.toolEvents) {
                    const derived = deriveDecisionEventsFromTool(
                      te.name,
                      te.args || {},
                      te.result || {},
                      te.durationMs || 0
                    );
                    for (const d of derived) {
                      if (!existingIds.has(d.id)) {
                        newEvents.push(d);
                      }
                    }
                  }
                  return [...prev, ...newEvents];
                });
              }
            }

            // Handle errors
            if (parsed.type === "error") {
              throw new Error(parsed.error || "Error in streaming chat response");
            }
          }
        }

        // Flush any remaining text in sentence buffer
        const { sentences: finalSentences } = extractSentences(sentenceBuffer, true);
        for (const sentence of finalSentences) {
          queueSentence(sentence);
        }

        isStreamCompleteRef.current = true;

        // Finalize aria turn in transcript
        setTranscript((prev) =>
          mergeTurnFragments(prev, "aria", "", { complete: true })
        );

        // Record in conversation history
        if (accumulatedResponse) {
          if (isUnclearAudioResponse(accumulatedResponse)) {
            triggerUnclearAudio();
          }
          conversationHistoryRef.current.push({
            role: "assistant",
            content: accumulatedResponse,
          });
        }

        // If no speech was queued, return to LISTENING immediately
        if (speechQueueRef.current.length === 0 && !isSpeakingSentenceRef.current) {
          setState(AGENT_STATES.LISTENING);
          log("Agent", "STATE_CHANGE", AGENT_STATES.LISTENING);

          if (isGoodbyePendingRef.current) {
            if (goodbyeEndTimerRef.current) clearTimeout(goodbyeEndTimerRef.current);
            goodbyeEndTimerRef.current = setTimeout(() => {
              log("CallEtiquette", "GOODBYE_AUTO_END", "Classic closing auto-ended after 2s grace");
              end("RESOLVED");
            }, GOODBYE_AUTO_END_DELAY_MS);
          }
        }
      } catch (err) {
        if (err.name === "AbortError") {
          log("Chat", "ABORTED", "In-flight chat request aborted");
          return;
        }

        console.error("[useClassicAgent] Error:", err);
        setError(err.message || "Failed to get response");
        setState(AGENT_STATES.ERROR);
        log("Agent", "ERROR", err.message);
      }
    },
    [sessionId, interrupt, log, queueSentence]
  );

  /**
   * Initialize microphone capture & micAnalyser
   */
  const initMicrophone = useCallback(async () => {
    try {
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
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Mic AnalyserNode
      const micAnalyserNode = ctx.createAnalyser();
      micAnalyserNode.fftSize = 256;
      micAnalyserNode.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(micAnalyserNode);
      setMicAnalyser(micAnalyserNode);

      // Agent AnalyserNode (simulated audio feedback for TTS)
      const agentAnalyserNode = ctx.createAnalyser();
      agentAnalyserNode.fftSize = 256;
      agentAnalyserNode.smoothingTimeConstant = 0.8;
      setAgentAnalyser(agentAnalyserNode);

      log("Mic", "ACTIVE", "Microphone stream and analysers initialized");
    } catch (err) {
      console.warn("[useClassicAgent] Mic access failed or rejected:", err);
      // Non-fatal if user wants typed input
    }
  }, [log]);

  /**
   * Start the Classic Agent session
   */
  const start = useCallback(async () => {
    if (stateRef.current !== AGENT_STATES.IDLE && stateRef.current !== AGENT_STATES.ENDED) {
      return;
    }

    setError(null);
    setState(AGENT_STATES.CONNECTING);
    log("Agent", "CONNECTING", "Starting Classic Voice Mode session");

    // Initialize microphone
    await initMicrophone();

    // Check SpeechRecognition support
    const SpeechRec =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRec) {
      const reason =
        "Speech recognition is not supported in this browser. You can type messages below or use Chrome/Edge for voice input.";
      setUnsupportedReason(reason);
      log("STT", "UNSUPPORTED", reason);
      setState(AGENT_STATES.LISTENING);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setState(AGENT_STATES.LISTENING);
        log("STT", "ACTIVE", "SpeechRecognition listening @ en-IN");
      };

      recognition.onresult = (event) => {
        if (isMutedRef.current) return;

        // Reset silence timer on any user speech and cancel pending goodbye timer
        silenceTimerRef.current?.reset();
        if (goodbyeEndTimerRef.current) {
          clearTimeout(goodbyeEndTimerRef.current);
          goodbyeEndTimerRef.current = null;
        }

        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcriptPiece = res[0]?.transcript || "";
          const confidence = res[0]?.confidence;

          // Requirement 2: Low confidence speech recognition soft indicator
          if (typeof confidence === "number" && confidence > 0 && confidence < 0.55) {
            triggerUnclearAudio();
          }

          if (res.isFinal) {
            finalText += transcriptPiece;
          } else {
            interimText += transcriptPiece;
          }
        }

        // Barge-in check: user spoke while agent is speaking or thinking
        if (
          (interimText || finalText) &&
          (stateRef.current === AGENT_STATES.SPEAKING ||
            stateRef.current === AGENT_STATES.THINKING)
        ) {
          interrupt();
        }

        if (finalText.trim()) {
          log("STT", "FINAL_SPEECH", finalText.trim());
          sendUserMessage(finalText.trim());
        } else if (interimText.trim()) {
          // Show live user interim speech
          setTranscript((prev) =>
            mergeTurnFragments(prev, "user", interimText.trim(), {
              complete: false,
              timestamp: new Date().toLocaleTimeString(),
              offsetMs: getCallOffsetMs(),
            })
          );
        }
      };

      recognition.onerror = (event) => {
        if (event.error === "no-speech") {
          // Normal silence, ignore
          return;
        }
        if (event.error === "not-allowed" || event.error === "audio-capture") {
          setError(`Microphone permission error: ${event.error}`);
          setState(AGENT_STATES.ERROR);
          log("STT", "ERROR", event.error);
        }
      };

      recognition.onend = () => {
        // Automatically restart recognition if still active
        if (
          stateRef.current !== AGENT_STATES.ENDED &&
          stateRef.current !== AGENT_STATES.IDLE &&
          stateRef.current !== AGENT_STATES.ERROR &&
          !isMutedRef.current
        ) {
          try {
            recognition.start();
          } catch (e) {
            // Already started or restarting
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();

      // Set call start timestamp and start client recorder (mic only in Classic mode)
      callStartEpochRef.current = Date.now();
      setRecording(null);

      try {
        const recorder = new CallRecorder({
          audioContext: audioContextRef.current,
          micStream: micStreamRef.current,
          mode: "classic",
        });
        if (recorder.start()) {
          callRecorderRef.current = recorder;
          log("Recording", "STARTED", "Classic audio recorder active (Mic only)");
        }
      } catch (recErr) {
        console.warn("[useClassicAgent] CallRecorder start failed:", recErr);
      }

      // Start client-side silence timer
      silenceTimerRef.current = new SilenceTimer({
        nudgeDelayMs: SILENCE_NUDGE_MS,
        abandonDelayMs: SILENCE_ABANDON_MS,
        onNudge: () => {
          if (isMutedRef.current) return;
          if (stateRef.current !== AGENT_STATES.LISTENING) return;

          log("SilenceTimer", "NUDGE", "8s customer silence reached in Classic mode. Nudging.");
          sendUserMessage(
            "[System note: The customer has been silent for 8 seconds. Please check in with a short, polite: \"Are you still there?\"]",
            { isSystemNudge: true }
          );
        },
        onAbandon: () => {
          if (isMutedRef.current) return;

          log("SilenceTimer", "ABANDON", "15s post-nudge silence in Classic mode. Ending as ABANDONED.");
          callResolutionRef.current = "ABANDONED";

          sendUserMessage(
            "[System note: The customer has remained silent for 23 seconds. Say a short, polite goodbye (e.g. \"It looks like we got disconnected. Feel free to call back anytime. Goodbye!\").]",
            { isSystemNudge: true }
          );

          setTimeout(() => {
            end("ABANDONED");
          }, 3500);
        },
      });
      silenceTimerRef.current.start();

      // Start 10-minute maximum call duration timer
      maxCallTimerRef.current = setTimeout(() => {
        log("Session", "MAX_CALL_TIMEOUT", "Maximum 10-minute call duration reached");
        end();
      }, maxCallDurationMs);
    } catch (recErr) {
      console.error("[useClassicAgent] SpeechRecognition start failed:", recErr);
      setError(recErr.message || "Failed to start speech recognition");
      setState(AGENT_STATES.LISTENING);
    }
  }, [initMicrophone, interrupt, log, sendUserMessage, maxCallDurationMs]);

  /**
   * End the session and clean up all resources
   */
  const end = useCallback(
    (resolution = "RESOLVED") => {
      callResolutionRef.current = resolution;
      log("Agent", "END", `Terminating Classic Agent session with resolution: ${resolution}`);

      // Stop recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }

      // Cancel speech synthesis
      stopSpeechSynthesis();

      // Abort pending fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Stop mic stream
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }

      // Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      // Clear timers
      if (maxCallTimerRef.current) {
        clearTimeout(maxCallTimerRef.current);
        maxCallTimerRef.current = null;
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

      // Finalize audio recording
      if (callRecorderRef.current) {
        const recorder = callRecorderRef.current;
        callRecorderRef.current = null;
        recorder.stop().then((rec) => {
          if (rec) {
            setRecording(rec);
            saveSessionRecording(sessionId || "default-session", rec.blob, {
              durationMs: rec.durationMs,
              mode: "classic",
              isClassicOnly: true,
            });
            log("Recording", "SAVED", `Classic recording finalized (${rec.durationMs}ms, ${rec.mimeType})`);
          }
        });
      }

      setMicAnalyser(null);
      setAgentAnalyser(null);
      setState(AGENT_STATES.ENDED);
    },
    [log, stopSpeechSynthesis]
  );

  /**
   * Toggle or set mute state
   */
  const mute = useCallback((forceMuted) => {
    setIsMuted((prev) => {
      const next = typeof forceMuted === "boolean" ? forceMuted : !prev;
      isMutedRef.current = next;

      // Enable/disable mic tracks
      if (micStreamRef.current) {
        micStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }

      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {}
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (maxCallTimerRef.current) {
        clearTimeout(maxCallTimerRef.current);
      }
    };
  }, []);

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
    unsupportedReason,
    start,
    end,
    mute,
    sendUserMessage,
    interrupt,
    sessionId,
  };
}
