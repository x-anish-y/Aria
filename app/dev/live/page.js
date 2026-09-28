"use client";

/**
 * app/dev/live/page.js — Developer test harness for Gemini Live voice agent
 *
 * Task 4d: Powered by hooks/useRealtimeAgent.js
 * Exposes:
 * - State: idle | connecting | listening | thinking | speaking | ended | error
 * - Transcript & merged turns
 * - Tool loop execution events
 * - Per-turn latency (current, avg, p50)
 * - Mic and Agent AnalyserNodes
 * - Mute, barge-in interrupt, and clean teardown
 *
 * Dev query params:
 * - ?maxCall=30   Set max call duration to 30 seconds (for testing timeout)
 */

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAgent } from "@/hooks/useAgent";
import { MAX_CALL_DURATION_MS } from "@/lib/audio/realtime-state";
import { GlassCard, Button, Badge } from "@/components/ui";
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Activity,
  Wrench,
  AlertCircle,
  CheckCircle2,
  PhoneOff,
  Radio,
  Cpu,
  Timer,
} from "lucide-react";

function GeminiLiveAudioDevPageInner() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [stateHistory, setStateHistory] = useState([]);
  const logContainerRef = useRef(null);
  const turnsContainerRef = useRef(null);

  // Parse ?maxCall=<seconds> from URL for testing timeout
  const maxCallDurationMs = useMemo(() => {
    const raw = searchParams.get("maxCall");
    if (raw && !isNaN(Number(raw))) {
      return Number(raw) * 1000;
    }
    return MAX_CALL_DURATION_MS;
  }, [searchParams]);
  const isCustomMaxCall = maxCallDurationMs !== MAX_CALL_DURATION_MS;

  const addLog = useCallback((source, type, details) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { id: Math.random().toString(36).slice(2), timestamp, source, type, details };
    setLogs((prev) => [...prev.slice(-99), entry]); // Retain last 100 entries
  }, []);

  const [typedInput, setTypedInput] = useState("");

  const {
    mode,
    switchMode,
    toast,
    clearToast,
    state,
    transcript,
    toolEvents,
    latency,
    micAnalyser,
    agentAnalyser,
    isMuted,
    error,
    unsupportedReason,
    start,
    end,
    mute,
    sendUserMessage,
    interrupt,
    sessionId,
  } = useAgent({
    onLog: addLog,
    maxCallDurationMs,
  });

  // Track state transitions for dev verification
  useEffect(() => {
    setStateHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last?.state === state) return prev;
      return [...prev.slice(-19), { state, time: new Date().toLocaleTimeString() }];
    });
  }, [state]);

  const isConnected =
    state === "listening" || state === "thinking" || state === "speaking";

  // Auto-scroll logs & conversation turns
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
    if (turnsContainerRef.current) {
      turnsContainerRef.current.scrollTop = turnsContainerRef.current.scrollHeight;
    }
  }, [logs, transcript]);

  // Dev actions
  const handleAskWhereIsOrd101 = () => {
    addLog("UserAction", "QUERY", "Where is ORD-101?");
    sendUserMessage("Where is ORD-101?");
  };

  const handleInterruptAria = () => {
    addLog("UserAction", "BARGE_IN", "User triggered barge-in interrupt.");
    interrupt();
  };

  const handleSendTyped = (e) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    addLog("UserAction", "TYPED_INPUT", typedInput.trim());
    sendUserMessage(typedInput.trim());
    setTypedInput("");
  };

  return (
    <div className="min-h-screen bg-canvas p-6 md:p-10 text-on-surface font-sans">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/15 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl text-ivory">Aria Live Voice Dev Harness</h1>
              <Badge
                variant={
                  state === "listening"
                    ? "delivered"
                    : state === "speaking"
                    ? "shipped"
                    : state === "thinking"
                    ? "processing"
                    : state === "connecting"
                    ? "processing"
                    : state === "error"
                    ? "cancelled"
                    : "outline"
                }
                dot
              >
                {state.toUpperCase()}
              </Badge>
              {state === "speaking" && (
                <Badge variant="shipped" dot>
                  ARIA SPEAKING
                </Badge>
              )}
              {state === "thinking" && (
                <Badge variant="processing" dot>
                  ARIA THINKING
                </Badge>
              )}
            </div>
            <p className="text-xs text-on-surface-muted mt-1">
              Task 4d: useRealtimeAgent Hook • State Derivation • 10-Min Max Call • Auto-Reconnect • Per-Turn Latency (Avg &amp; p50)
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => switchMode(mode === "realtime" ? "classic" : "realtime")}
              className="text-xs font-mono border-outline-variant/30"
              title="Click to toggle between Realtime and Classic mode"
            >
              Mode: <strong className="ml-1 text-primary">{mode === "realtime" ? "Gemini Live" : "Groq Classic"}</strong>
            </Button>

            {!isConnected && state !== "connecting" ? (
              <Button variant="secondary" onClick={start}>
                Connect (Start Voice)
              </Button>
            ) : state === "connecting" ? (
              <Button variant="secondary" disabled>
                Connecting...
              </Button>
            ) : (
              <>
                <Button variant={isMuted ? "outline" : "ghost"} onClick={() => mute()}>
                  {isMuted ? (
                    <MicOff className="w-4 h-4 mr-1 text-danger" />
                  ) : (
                    <Mic className="w-4 h-4 mr-1 text-primary" />
                  )}
                  {isMuted ? "Unmute" : "Mute"}
                </Button>
                <Button variant="secondary" onClick={handleAskWhereIsOrd101}>
                  <Wrench className="w-4 h-4 mr-1" />
                  Ask &quot;Where is ORD-101?&quot;
                </Button>
                <Button
                  variant="outline"
                  onClick={handleInterruptAria}
                  disabled={state !== "speaking"}
                  className="border-danger/40 text-danger hover:bg-danger/10"
                >
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Interrupt (Barge-in)
                </Button>
                <Button variant="ghost" onClick={end}>
                  <PhoneOff className="w-4 h-4 mr-1" />
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div className="p-3 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="font-medium">{toast.message}</span>
            </div>
            <button onClick={clearToast} className="text-on-surface-muted hover:text-ivory text-xs underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Unsupported STT Warning */}
        {unsupportedReason && mode === "classic" && (
          <div className="p-3 rounded-lg bg-warning/15 border border-warning/30 text-warning text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{unsupportedReason}</span>
          </div>
        )}

        {/* Telemetry Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <GlassCard tier="rest" className="p-3 flex items-center gap-3">
            <Mic className={`w-5 h-5 ${isConnected && !isMuted ? "text-primary" : "text-on-surface-muted"}`} />
            <div>
              <div className="text-xs font-semibold text-ivory">Microphone</div>
              <div className="text-[11px] text-on-surface-muted font-mono">
                {isConnected
                  ? isMuted
                    ? "Muted"
                    : micAnalyser
                    ? "Streaming (16 kHz PCM)"
                    : "Active"
                  : "Inactive"}
              </div>
            </div>
          </GlassCard>

          <GlassCard tier="rest" className="p-3 flex items-center gap-3">
            <Volume2 className={`w-5 h-5 ${state === "speaking" ? "text-secondary" : "text-on-surface-muted"}`} />
            <div>
              <div className="text-xs font-semibold text-ivory">Speaker Output</div>
              <div className="text-[11px] text-on-surface-muted font-mono">
                {state === "speaking"
                  ? "Active (24 kHz PCM)"
                  : agentAnalyser
                  ? "Ready / Idle"
                  : "Idle"}
              </div>
            </div>
          </GlassCard>

          <GlassCard tier="rest" className="p-3 flex items-center gap-3">
            <Activity className="w-5 h-5 text-accent" />
            <div>
              <div className="text-xs font-semibold text-ivory">Per-Turn Latency</div>
              <div className="text-[11px] text-ivory font-mono font-medium">
                {latency.current !== null ? `${latency.current} ms` : "Awaiting speech..."}
              </div>
              <div className="text-[10px] text-on-surface-muted font-mono">
                Avg: {latency.avg !== null ? `${latency.avg} ms` : "—"} • p50:{" "}
                {latency.p50 !== null ? `${latency.p50} ms` : "—"}
              </div>
            </div>
          </GlassCard>

          <GlassCard tier="rest" className="p-3 flex items-center gap-3">
            <Wrench className="w-5 h-5 text-primary-light" />
            <div>
              <div className="text-xs font-semibold text-ivory">Tool Events</div>
              <div className="text-[11px] text-on-surface-muted font-mono">
                {toolEvents.length} call{toolEvents.length !== 1 ? "s" : ""} executed
              </div>
              <div className="text-[10px] text-on-surface-muted font-mono truncate max-w-[120px]">
                {sessionId}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Custom Max Call Duration Banner */}
        {isCustomMaxCall && (
          <div className="p-3 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs flex items-center gap-2">
            <Timer className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Dev override:</strong> Max call duration set to{" "}
              <strong>{maxCallDurationMs / 1000}s</strong> via ?maxCall param.
              {state === "ended" && " — Call ended due to timeout."}
            </span>
          </div>
        )}

        {/* State Transition History (dev verification) */}
        {stateHistory.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-1">
            <span className="text-[10px] text-on-surface-muted font-mono mr-1">State history:</span>
            {stateHistory.map((entry, i) => (
              <span key={i} className="text-[10px] font-mono text-ivory/70 flex items-center gap-0.5">
                {i > 0 && <span className="text-on-surface-muted">→</span>}
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    entry.state === "listening"
                      ? "bg-green-500/20 text-green-400"
                      : entry.state === "speaking"
                      ? "bg-blue-500/20 text-blue-400"
                      : entry.state === "thinking"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : entry.state === "connecting"
                      ? "bg-purple-500/20 text-purple-400"
                      : entry.state === "error"
                      ? "bg-red-500/20 text-red-400"
                      : entry.state === "ended"
                      ? "bg-gray-500/20 text-gray-400"
                      : "bg-surface text-on-surface-muted"
                  }`}
                >
                  {entry.state}
                </span>
                <span className="text-on-surface-muted text-[9px]">{entry.time}</span>
              </span>
            ))}
          </div>
        )}

        {/* Error Alert if state is error */}
        {error && (
          <div className="p-3 rounded-lg bg-danger/15 border border-danger/30 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Error:</strong> {error.message || JSON.stringify(error)}
            </span>
          </div>
        )}

        {/* Middle Two-Column Grid: Left: Conversation Turns, Right: Tool Execution Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversation Turns (Merged Fragments with Timestamps) */}
          <GlassCard tier="elevated" className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
              <h2 className="text-xs font-semibold text-ivory tracking-wide uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary-light" />
                Conversation Turns ({transcript.length})
              </h2>
              <span className="text-[11px] text-on-surface-muted">Merged speaker turns</span>
            </div>

            <div
              ref={turnsContainerRef}
              className="h-[360px] overflow-y-auto flex flex-col gap-3 p-2 bg-canvas/30 rounded border border-outline-variant/10 font-sans"
            >
              {transcript.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-muted text-xs">
                  No turns yet. Speak into the mic or click &quot;Ask &apos;Where is ORD-101?&apos;&quot;.
                </div>
              ) : (
                transcript.map((turn) => (
                  <div
                    key={turn.id}
                    className={`p-3 rounded-lg flex flex-col gap-1 border ${
                      turn.speaker === "user"
                        ? "bg-surface/50 border-outline-variant/20 ml-6"
                        : "bg-surface-elevated/70 border-primary/20 mr-6"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`font-semibold ${turn.speaker === "user" ? "text-primary" : "text-secondary"}`}>
                        {turn.speaker === "user" ? "You" : "Aria"}
                      </span>
                      <div className="flex items-center gap-2">
                        {turn.isInterrupted && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger border border-danger/30 font-medium">
                            Interrupted
                          </span>
                        )}
                        <span className="text-on-surface-muted font-mono">{turn.timestamp}</span>
                      </div>
                    </div>
                    <p className="text-xs text-ivory leading-relaxed">{turn.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendTyped} className="flex gap-2 pt-2 border-t border-outline-variant/15">
              <input
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder="Type a message or test query..."
                className="flex-1 bg-surface/40 border border-outline-variant/20 rounded px-3 py-1.5 text-xs text-ivory placeholder:text-on-surface-muted focus:outline-none focus:border-primary"
              />
              <Button type="submit" variant="secondary" disabled={!typedInput.trim()}>
                Send
              </Button>
            </form>
          </GlassCard>

          {/* Tool Execution Events (Args, Result, Duration) */}
          <GlassCard tier="elevated" className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
              <h2 className="text-xs font-semibold text-ivory tracking-wide uppercase flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-accent" />
                Tool Events ({toolEvents.length})
              </h2>
              <span className="text-[11px] text-on-surface-muted font-mono">POST /api/tools/[name]</span>
            </div>

            <div className="h-[360px] overflow-y-auto flex flex-col gap-2 p-2 bg-canvas/30 rounded border border-outline-variant/15 font-mono text-xs">
              {toolEvents.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-muted text-xs">
                  No tools invoked yet. Asking order questions will trigger the tool loop.
                </div>
              ) : (
                toolEvents.map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 rounded bg-surface/40 border border-outline-variant/15 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-accent flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />
                        {t.name}()
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-ivory border border-outline-variant/20">
                          {t.durationMs} ms
                        </span>
                        <span className="text-on-surface-muted">{t.timestamp}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-on-surface-muted">
                      <span className="text-primary font-semibold">Args:</span> {JSON.stringify(t.args)}
                    </div>

                    <pre className="text-[10px] text-ivory/80 whitespace-pre-wrap break-all bg-canvas/60 p-2 rounded max-h-24 overflow-y-auto">
                      {JSON.stringify(t.result, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        {/* Live Event Log Stream */}
        <GlassCard tier="rest" className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
            <h2 className="text-xs font-semibold text-ivory tracking-wide uppercase flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-primary-light" />
              Protocol Stream Log ({logs.length})
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
              Clear
            </Button>
          </div>

          <div
            ref={logContainerRef}
            className="h-[200px] overflow-y-auto font-mono text-xs flex flex-col gap-1.5 p-2 bg-canvas/40 rounded border border-outline-variant/10"
          >
            {logs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-muted text-xs">
                Log stream empty. Click &quot;Connect&quot; to begin session.
              </div>
            ) : (
              logs.map((item) => (
                <div
                  key={item.id}
                  className="p-1 rounded bg-surface/30 border border-outline-variant/10 flex flex-col gap-0.5 text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-muted">{item.timestamp}</span>
                    <span
                      className={`font-semibold ${
                        item.source.includes("BargeIn")
                          ? "text-danger"
                          : item.source.includes("Tool")
                          ? "text-accent"
                          : item.source.includes("Server")
                          ? "text-secondary"
                          : "text-primary"
                      }`}
                    >
                      {item.source} ➔ {item.type}
                    </span>
                  </div>
                  <pre className="text-[10px] text-ivory/80 whitespace-pre-wrap break-all bg-canvas/40 p-1 rounded max-h-20 overflow-y-auto">
                    {typeof item.details === "object"
                      ? JSON.stringify(item.details, null, 2)
                      : String(item.details)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export default function GeminiLiveAudioDevPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas flex items-center justify-center text-on-surface-muted">Loading harness...</div>}>
      <GeminiLiveAudioDevPageInner />
    </Suspense>
  );
}
