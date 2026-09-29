"use client";

/**
 * app/page.js — Aria Voice Agent Main Experience
 *
 * Requirements (Task 6):
 * 1. Orb: Agent presence with real-time audio-reactivity (idle, connecting, listening, thinking, speaking)
 * 2. Call controls: Morphing round button with call timer, Space shortcut, mute, mode & latency badges
 * 3. State pill: Animated crossfaded state indicator with semantic icons & text labels
 * 4. Live transcript: Streaming bubbles (customer right, agent left), smart autoscroll, inline tool chips
 * 5. Test Orders panel: 3 live orders with copy ID, highlight animation, 6 "Try saying" chips, demo reset
 * 6. Error/empty states: Pre-call checklist, mic denied guide, quota fallback banner, offline banner
 * 7. Screen transitions: Smooth glide across idle -> in-call -> post-call phases using AnimatePresence
 * 8. Responsive layout: Desktop 2-pane split (60/40), Mobile stacked with bottom sheet & safe-area padding
 * 9. Accessibility: aria-live announcements, focus rings, reduced-motion fallback
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  PhoneCall,
  Volume2,
  Mic,
  MicOff,
  Package,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Radio,
  History,
  ArrowLeft,
  ArrowRight,
  Brain,
  ExternalLink,
} from "lucide-react";
import { useAgent } from "@/hooks/useAgent";
import { Orb } from "@/components/Orb";
import { StatePill } from "@/components/StatePill";
import { CallControls } from "@/components/CallControls";
import { LiveTranscript } from "@/components/LiveTranscript";
import { TestOrdersPanel } from "@/components/TestOrdersPanel";
import { AgentBrainPanel } from "@/components/AgentBrainPanel";
import { GuidedTourCard } from "@/components/GuidedTourCard";
import { GUIDED_SCENARIOS, getGuidedScenariosForBrand, evaluateScenarios } from "@/lib/scenarios";
import { getBrand, applyBrandTheme } from "@/lib/brands";
import { buildSystemInstruction } from "@/lib/agent-config";
import { AGENT_STATES } from "@/lib/audio/realtime-state";
import dynamic from "next/dynamic";
import {
  PreCallChecklist,
  MicDeniedCard,
  OfflineBanner,
} from "@/components/CallChecklist";
import { Navbar } from "@/components/Navbar";
import { OnboardingHint } from "@/components/OnboardingHint";
import { Badge, ThemeToggle } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import {
  fadeUp,
  fadeIn,
  springGentle,
  staggerContainer,
  staggerItem,
  tapScale,
  hoverLift,
} from "@/lib/motion";
import { playCallStartCue, playCallEndCue } from "@/lib/sound-cues";

// Dynamic-import heavy post-call evaluation & drawer components to optimize initial load
const PostCallSummary = dynamic(
  () => import("@/components/PostCallSummary").then((mod) => mod.PostCallSummary),
  { ssr: false }
);

const HistoryDrawer = dynamic(
  () => import("@/components/HistoryDrawer").then((mod) => mod.HistoryDrawer),
  { ssr: false }
);

export default function Home() {
  const { addToast } = useToast();

  // Multi-brand state with persistence and theme CSS variable synchronization
  const [brandId, setBrandId] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("aria_brand_id");
        if (saved === "aura" || saved === "kaveri") return saved;
      } catch {}
    }
    return "aura";
  });

  const brand = useMemo(() => getBrand(brandId), [brandId]);
  const systemInstruction = useMemo(() => buildSystemInstruction(brandId), [brandId]);

  // Apply theme tokens (CSS variables) to documentElement
  useEffect(() => {
    applyBrandTheme(brandId);
  }, [brandId]);

  // Unified Agent hook managing both Realtime and Classic modes
  const {
    mode,
    switchMode,
    toast: agentToast,
    clearToast: clearAgentToast,
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
    callResolution,
    recording,
    error,
    unsupportedReason,
    start,
    end,
    mute,
    sendUserMessage,
    interrupt,
    resetSession,
    sessionId,
  } = useAgent({
    brandId,
    systemInstruction,
    voice: brand.voice,
  });

  const isInCall = state !== AGENT_STATES.IDLE && state !== AGENT_STATES.ENDED;

  const [summaryData, setSummaryData] = useState(null);
  const [summaryCallId, setSummaryCallId] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryMetrics, setSummaryMetrics] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedHistoryCall, setSelectedHistoryCall] = useState(null);
  const [isBrainOpen, setIsBrainOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState("tour"); // "tour" | "orders" | "brain"

  // ── Guided Tour Evaluator Progress & Session Persistence (Per Brand) ──
  const brandScenarios = useMemo(() => getGuidedScenariosForBrand(brandId), [brandId]);
  const tourStorageKey = `aria_guided_tour_${brandId}_${sessionId || "default"}`;
  const [persistedTourPassed, setPersistedTourPassed] = useState({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = sessionStorage.getItem(tourStorageKey);
      if (stored) {
        setPersistedTourPassed(JSON.parse(stored));
      } else {
        setPersistedTourPassed({});
      }
    } catch {}
  }, [tourStorageKey]);

  // Pure function evaluation from real toolEvents & guardrail signals
  const tourEvaluation = useMemo(() => {
    return evaluateScenarios(brandScenarios, toolEvents);
  }, [brandScenarios, toolEvents]);

  // Total passed count combining live evaluation and session persistence
  const tourPassedCount = useMemo(() => {
    let count = 0;
    brandScenarios.forEach((sc) => {
      if (persistedTourPassed[sc.id] || tourEvaluation.results[sc.id]) {
        count++;
      }
    });
    return count;
  }, [brandScenarios, persistedTourPassed, tourEvaluation.results]);

  // Brand Switcher handler (enforces disallowing mid-call)
  const handleSwitchBrand = useCallback(
    (newBrandId) => {
      if (newBrandId === brandId) return;

      if (isInCall) {
        addToast?.({
          message: "Brand switching is locked during an active call. Please end the call first.",
          type: "warning",
        });
        return;
      }

      setBrandId(newBrandId);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("aria_brand_id", newBrandId);
        } catch {}
      }

      applyBrandTheme(newBrandId);
      const newBrand = getBrand(newBrandId);

      // Start fresh session and clear call-state for fresh brand session
      resetSession();
      clearToolEvents();
      setPersistedTourPassed({});
      setSummaryData(null);
      setSummaryCallId(null);
      setSummaryMetrics(null);

      addToast?.({
        message: `Switched brand to ${newBrand.name} (${newBrand.persona_name})`,
        type: "info",
      });
    },
    [brandId, isInCall, addToast, resetSession, clearToolEvents]
  );

  // Synchronize reset when "Reset demo data" is clicked
  useEffect(() => {
    const handleResetEvent = (e) => {
      if (!e.detail?.sessionId || e.detail.sessionId === sessionId) {
        setPersistedTourPassed({});
        try {
          sessionStorage.removeItem(tourStorageKey);
        } catch {}
      }
    };
    window.addEventListener("aria:reset-tour", handleResetEvent);
    return () => window.removeEventListener("aria:reset-tour", handleResetEvent);
  }, [sessionId, tourStorageKey]);

  // ── System Health & Degradation State ──────────────────────────────
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthBannerDismissed, setHealthBannerDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setHealthStatus(data);
        }
      } catch {
        if (isMounted) {
          setHealthStatus({
            db: false,
            live: false,
            classic: false,
            degraded: true,
            networkError: true,
          });
        }
      }
    }
    checkHealth();
  }, []);

  const healthIssue = useMemo(() => {
    if (!healthStatus || healthBannerDismissed) return null;
    if (healthStatus.networkError) {
      return {
        title: "Network Unreachable",
        message: "Cannot reach server endpoints. Please check your internet connection.",
        severity: "error",
      };
    }
    if (!healthStatus.live && !healthStatus.classic) {
      return {
        title: "Voice Services Offline",
        message: "Both Gemini Live and Classic voice models are unreachable. Check your API keys in .env.local.",
        severity: "error",
      };
    }
    if (!healthStatus.live) {
      return {
        title: "Gemini Live Unavailable",
        message: "Realtime voice is temporarily unreachable. Classic mode fallback (Groq + Web Speech) is active.",
        severity: "warning",
      };
    }
    if (!healthStatus.db || healthStatus.degraded) {
      return {
        title: "Database In-Memory Mode",
        message: "Neon Postgres is unreachable; running in temporary in-memory fallback mode. Orders reset on restart.",
        severity: "info",
      };
    }
    if (!healthStatus.classic) {
      return {
        title: "Classic Fallback Unreachable",
        message: "Groq API key is unconfigured or unreachable. Gemini Live remains fully active.",
        severity: "info",
      };
    }
    return null;
  }, [healthStatus, healthBannerDismissed]);

  const callStartTimeRef = useRef(null);
  const hasFetchedSummaryRef = useRef(false);

  // Track start time when entering a call
  useEffect(() => {
    if (isInCall && !callStartTimeRef.current) {
      callStartTimeRef.current = Date.now();
      hasFetchedSummaryRef.current = false;
      setSelectedHistoryCall(null);
    }
  }, [isInCall]);

  // When call ends or terminates, automatically request post-call summary and persist call
  useEffect(() => {
    const isCallTerminated = state === "ended" || state === "error";
    if (
      isCallTerminated &&
      !hasFetchedSummaryRef.current &&
      (callStartTimeRef.current !== null || transcript.length > 0)
    ) {
      hasFetchedSummaryRef.current = true;
      const startMs = callStartTimeRef.current || Date.now() - 5000;
      const endMs = Date.now();
      callStartTimeRef.current = null; // Clear active call timer

      const durationSeconds = Math.max(1, Math.round((endMs - startMs) / 1000));

      const metricsPayload = {
        durationSeconds,
        turns: transcript.length,
        avgLatencyMs: latency?.avg || 0,
        p50LatencyMs: latency?.p50 || 0,
      };
      setSummaryMetrics(metricsPayload);
      setSummaryLoading(true);

      fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          mode,
          transcript,
          toolEvents,
          metrics: metricsPayload,
          startedAt: new Date(startMs).toISOString(),
          endedAt: new Date(endMs).toISOString(),
          resolution: callResolution || "RESOLVED",
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.callId) {
            setSummaryCallId(data.callId);
          }
          if (data.ok && data.summary) {
            setSummaryData(data.summary);
            addToast({ message: "Post-call evaluation recorded", type: "success" });
          } else {
            addToast({ message: "Loaded call summary", type: "info" });
          }
        })
        .catch((err) => {
          console.warn("[page] Summary fetch error:", err);
        })
        .finally(() => {
          setSummaryLoading(false);
        });
    }
  }, [state, transcript, toolEvents, sessionId, mode, latency, addToast]);

  // Sound cue handlers for call start & end
  const handleStartCall = useCallback(async () => {
    callStartTimeRef.current = Date.now();
    hasFetchedSummaryRef.current = false;
    setSelectedHistoryCall(null);
    setSummaryCallId(null);
    playCallStartCue();
    await start();
  }, [start]);

  const handleEndCall = useCallback(() => {
    playCallEndCue();
    end();
  }, [end]);

  // Handler to start a new call from post-call view
  const handleStartNewCall = useCallback(async () => {
    setSummaryData(null);
    setSelectedHistoryCall(null);
    setSummaryMetrics(null);
    setSummaryCallId(null);
    callStartTimeRef.current = Date.now();
    hasFetchedSummaryRef.current = false;
    playCallStartCue();
    await start();
  }, [start]);

  const isPostCallView =
    Boolean(selectedHistoryCall) ||
    (state === "ended" && (summaryLoading || summaryData !== null));

  const isMicDenied =
    error &&
    (error.message?.includes("Permission denied") ||
      error.message?.includes("not-allowed") ||
      error.message?.includes("Permission"));

  // Last tool event for highlighting modified orders
  const lastToolEvent = useMemo(() => {
    return toolEvents.length > 0 ? toolEvents[toolEvents.length - 1] : null;
  }, [toolEvents]);

  // Handle "Try Saying" chip selection
  const handleSelectPrompt = useCallback(
    (promptText) => {
      // If we are currently in post-call view, clear it
      if (isPostCallView) {
        setSummaryData(null);
        setSelectedHistoryCall(null);
      }
      if (isInCall) {
        sendUserMessage(promptText);
        addToast({ message: `Sent: "${promptText}"`, type: "info" });
      } else {
        // Start call with sound cue then send prompt
        playCallStartCue();
        callStartTimeRef.current = Date.now();
        hasFetchedSummaryRef.current = false;
        start().then(() => {
          setTimeout(() => {
            sendUserMessage(promptText);
          }, 800);
        });
        addToast({ message: `Starting call with: "${promptText}"`, type: "info" });
      }
    },
    [isInCall, isPostCallView, sendUserMessage, start, addToast]
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-canvas text-on-surface font-sans selection:bg-primary/20 selection:text-primary">
      {/* Offline banner detection */}
      <OfflineBanner />

      {/* ── Header with Animated Active Navigation & Guided Tour Ring ── */}
      <Navbar
        mode={mode}
        activeBrandId={brandId}
        onSwitchBrand={handleSwitchBrand}
        isInCall={isInCall}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenBrain={() => setIsBrainOpen(true)}
        brainEventsCount={toolEvents.length}
        onOpenTour={() => {
          setRightPanelTab("tour");
          const el = document.getElementById("guided-tour-card");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        tourPassedCount={tourPassedCount}
        tourTotalCount={brandScenarios.length}
      />

      {/* ── System Banners / Notifications ─────────────────── */}
      <AnimatePresence>
        {/* Health status banner (degraded, offline, or provider down) */}
        {healthIssue && (
          <motion.div
            key="health-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`w-full border-b px-4 py-2 text-xs flex items-center justify-between z-20 backdrop-blur-sm flex-wrap gap-2 ${
              healthIssue.severity === "error"
                ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                : healthIssue.severity === "warning"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-200"
                : "bg-secondary/15 border-secondary/30 text-secondary-light"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong className="font-semibold mr-1">{healthIssue.title}:</strong>
                {healthIssue.message}
              </span>
            </div>
            <button
              onClick={() => setHealthBannerDismissed(true)}
              className="text-[11px] underline opacity-80 hover:opacity-100 transition-opacity ml-auto"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Fallback Toast Banner */}
        {agentToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full bg-accent/20 border-b border-accent/40 text-accent px-4 py-2 text-xs flex items-center justify-between z-20 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent shrink-0" />
              <span className="font-medium">{agentToast.message}</span>
            </div>
            <button
              onClick={clearAgentToast}
              className="text-[11px] text-on-surface-muted hover:text-ivory underline ml-2"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Muted Mic Banner (Requirement 4) */}
        {isInCall && isMuted && (
          <motion.div
            key="muted-mic-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full bg-rose-500/20 border-b border-rose-500/40 text-rose-200 px-4 py-2.5 text-xs flex items-center justify-between z-20 backdrop-blur-sm flex-wrap gap-2"
          >
            <div className="flex items-center gap-2">
              <MicOff className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong className="font-semibold mr-1">Microphone is muted:</strong>
                Aria cannot hear you. Silence detection paused.
              </span>
            </div>
            <button
              onClick={() => mute(false)}
              className="px-3 py-1 rounded-full bg-rose-500/30 hover:bg-rose-500/50 text-rose-100 text-[11px] font-medium transition-colors border border-rose-500/40"
            >
              Unmute (M)
            </button>
          </motion.div>
        )}

        {/* Unsupported Speech Recognition Notice with Cross-Browser Guidance */}
        {unsupportedReason && mode === "classic" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full bg-warning/15 border-b border-warning/30 text-warning px-4 py-2.5 text-xs flex items-center justify-between z-20 backdrop-blur-sm flex-wrap gap-2"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-warning shrink-0" />
              <span>{unsupportedReason}</span>
            </div>
            <button
              onClick={() => switchMode("realtime")}
              className="px-2.5 py-1 rounded-lg bg-primary text-black font-semibold text-[11px] hover:bg-primary-light transition-colors shadow-sm"
            >
              Switch to Gemini Live
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content Stage ─────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        {/* Onboarding hint overlay on first visit */}
        {!isInCall && !isPostCallView && <OnboardingHint />}

        <AnimatePresence mode="wait">
          {isPostCallView ? (
            /* ── Post-Call Screen Mode ── */
            <motion.div
              key="post-call-screen"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full"
            >
              {/* Back to Live indicator if viewing historical call */}
              {selectedHistoryCall && (
                <div className="max-w-4xl mx-auto mb-4 p-3 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-secondary-light font-mono">
                    <History className="w-4 h-4" />
                    <span>
                      Viewing previous call from{" "}
                      {new Date(selectedHistoryCall.started_at).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedHistoryCall(null)}
                    className="text-xs text-ivory hover:underline flex items-center gap-1 font-sans"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to current session</span>
                  </button>
                </div>
              )}

              <PostCallSummary
                summary={selectedHistoryCall ? selectedHistoryCall.summary : summaryData}
                loading={!selectedHistoryCall && summaryLoading}
                callId={selectedHistoryCall ? selectedHistoryCall.id : summaryCallId}
                recording={recording}
                metrics={
                  selectedHistoryCall
                    ? selectedHistoryCall.metrics || {
                        durationSeconds: selectedHistoryCall.duration_s,
                      }
                    : summaryMetrics || {
                        durationSeconds: 0,
                        turns: transcript.length,
                        avgLatencyMs: latency?.avg || 0,
                        p50LatencyMs: latency?.p50 || 0,
                      }
                }
                transcript={
                  selectedHistoryCall
                    ? selectedHistoryCall.transcript || []
                    : transcript
                }
                toolEvents={
                  selectedHistoryCall
                    ? selectedHistoryCall.tool_events || []
                    : toolEvents
                }
                onStartNewCall={handleStartNewCall}
                onOpenHistory={() => setIsHistoryOpen(true)}
              />
            </motion.div>
          ) : (
            /* ── In-Call / Live Interaction Stage ── */
            <motion.div
              key="live-stage"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
            >
              {/* Left Stage: Voice Presence & Controls (7 Cols on Desktop) */}
              <section className="lg:col-span-7 flex flex-col gap-6 w-full">
                {/* Central Voice Presence Glass Container */}
                <motion.div
                  layout
                  transition={springGentle}
                  className="relative rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center overflow-hidden border border-outline-variant/20 shadow-2xl bg-surface-container/60 backdrop-blur-xl"
                  style={{ minHeight: "380px" }}
                >
                  {/* Ambient Background Aura */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-40 transition-opacity"
                    style={{
                      background:
                        state === "speaking"
                          ? "radial-gradient(circle at 50% 40%, rgba(242, 202, 80, 0.25), transparent 70%)"
                          : state === "listening"
                          ? "radial-gradient(circle at 50% 40%, rgba(78, 222, 163, 0.25), transparent 70%)"
                          : "radial-gradient(circle at 50% 40%, rgba(16, 185, 129, 0.15), transparent 70%)",
                    }}
                  />

                  {/* State Pill Header & Unclear Audio Soft Indicator */}
                  <div className="mb-3 z-10 flex flex-col items-center gap-2">
                    <StatePill state={state} />
                    <AnimatePresence>
                      {isUnclearAudio && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.95 }}
                          transition={springGentle}
                          className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs shadow-md"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                          <span className="font-medium">Didn&apos;t catch that — please speak clearly or repeat</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* The Real-Time Audio-Reactive Orb */}
                  <div className="my-2 z-10">
                    <Orb
                      state={state}
                      micAnalyser={micAnalyser}
                      agentAnalyser={agentAnalyser}
                      size={230}
                    />
                  </div>

                  {/* Micro-status context text */}
                  <div className="mt-2 mb-6 z-10 max-w-xs">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={state}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-xs text-on-surface-muted leading-relaxed font-sans"
                      >
                        {state === "idle" &&
                          `Press the gold button or Spacebar to start your conversation with ${brand.persona_name || "Aria"}.`}
                        {state === "connecting" &&
                          "Establishing low-latency encrypted audio connection..."}
                        {state === "listening" &&
                          (isMuted
                            ? "Microphone is muted. Click unmute or press M to speak."
                            : `${brand.persona_name || "Aria"} is listening. Speak your question or order number naturally.`)}
                        {state === "thinking" &&
                          `Consulting ${brand.name} policy and checking customer records...`}
                        {state === "speaking" &&
                          `${brand.persona_name || "Aria"} is responding. You can speak anytime to interrupt (barge-in).`}
                        {state === "ended" &&
                          "Conversation concluded. Click below to start a new consultation."}
                        {state === "error" &&
                          (error?.message || "An unexpected issue occurred. Please reconnect.")}
                      </motion.p>
                    </AnimatePresence>
                  </div>

                  {/* Morphing Call Controls */}
                  <div className="z-10 w-full">
                    <CallControls
                      state={state}
                      mode={mode}
                      isMuted={isMuted}
                      latency={latency}
                      onStart={handleStartCall}
                      onEnd={handleEndCall}
                      onMute={() => mute()}
                      onSwitchMode={switchMode}
                    />
                  </div>
                </motion.div>

                {/* Mic Denied Step-by-Step Card if user blocked mic */}
                {isMicDenied && <MicDeniedCard onRetry={start} />}

                {/* Live Transcript Stream Container */}
                <div className="h-[460px] w-full">
                  <LiveTranscript
                    transcript={transcript}
                    toolEvents={toolEvents}
                    state={state}
                    onSendTypedMessage={sendUserMessage}
                  />
                </div>

                {/* Pre-Call Quick Actions & Checklist (visible when idle or ended) */}
                {!isInCall && (
                  <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-4">
                    {/* "Take the 3-minute tour" Quick Evaluator Callout Banner */}
                    <motion.button
                      whileHover={hoverLift}
                      whileTap={tapScale}
                      onClick={() => {
                        setRightPanelTab("tour");
                        const el = document.getElementById("guided-tour-card");
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-primary/15 via-surface-container to-secondary/15 border border-primary/30 flex items-center justify-between text-left hover:border-primary/60 transition-all shadow-md group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary-light shrink-0 group-hover:scale-105 transition-transform">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-ivory flex items-center gap-2">
                            <span>Take the 3-Minute Evaluator Tour</span>
                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-secondary/20 text-secondary-light border border-secondary/30">
                              {tourPassedCount}/8 Passed
                            </span>
                          </p>
                          <p className="text-[11px] text-on-surface-muted">
                            Validate order tracking, cancellation policies, returns, guardrails & barge-in
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-primary-light text-xs font-semibold shrink-0">
                        <span className="hidden sm:inline">Start Tour</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </motion.button>

                    <PreCallChecklist />
                  </motion.div>
                )}
              </section>

              {/* Right Stage: Guided Test Tour / Test Orders / Agent Brain */}
              <section className="lg:col-span-5 w-full flex flex-col gap-3">
                {/* Responsive Tab Switcher (Tour vs Orders vs Brain) */}
                <div className="flex items-center justify-between p-1 rounded-2xl bg-surface-container/80 border border-outline-variant/25 shadow-inner">
                  <div className="flex items-center gap-1 w-full">
                    {/* Guided Tour Tab */}
                    <button
                      onClick={() => setRightPanelTab("tour")}
                      className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        rightPanelTab === "tour"
                          ? "bg-surface-highest text-ivory border border-primary/40 shadow-sm"
                          : "text-on-surface-muted hover:text-ivory"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-primary-light" />
                      <span className="truncate">Guided Tour</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-primary/20 text-primary-light border border-primary/30">
                        {tourPassedCount}/{brandScenarios.length}
                      </span>
                    </button>

                    {/* Test Orders Tab */}
                    <button
                      onClick={() => setRightPanelTab("orders")}
                      className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        rightPanelTab === "orders"
                          ? "bg-surface-highest text-ivory border border-outline-variant/30 shadow-sm"
                          : "text-on-surface-muted hover:text-ivory"
                      }`}
                    >
                      <Package className="w-3.5 h-3.5 text-secondary-light" />
                      <span className="truncate">Test Orders</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/10 text-on-surface-muted">
                        {brand.testOrders?.length || 3}
                      </span>
                    </button>

                    {/* Agent Brain Tab */}
                    <button
                      onClick={() => setRightPanelTab("brain")}
                      className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        rightPanelTab === "brain"
                          ? "bg-surface-highest text-ivory border border-primary/40 shadow-sm"
                          : "text-on-surface-muted hover:text-ivory"
                      }`}
                    >
                      <Brain className="w-3.5 h-3.5 text-primary animate-pulse" />
                      <span className="truncate">Brain</span>
                      {toolEvents.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-primary text-black font-bold">
                          {toolEvents.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Pop out drawer button for desktop */}
                  <button
                    onClick={() => setIsBrainOpen(true)}
                    title="Open full Agent Brain side drawer"
                    className="p-1.5 rounded-xl text-on-surface-muted hover:text-ivory hover:bg-white/5 transition-colors ml-1 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {rightPanelTab === "tour" ? (
                  <GuidedTourCard
                    brandId={brandId}
                    events={toolEvents}
                    sessionId={sessionId}
                    latency={latency}
                    onSelectPrompt={handleSelectPrompt}
                    onToast={(msg, type) =>
                      addToast({ message: msg, type: type || "info" })
                    }
                  />
                ) : rightPanelTab === "orders" ? (
                  <>
                    <GuidedTourCard
                      brandId={brandId}
                      events={toolEvents}
                      sessionId={sessionId}
                      latency={latency}
                      onSelectPrompt={handleSelectPrompt}
                      onToast={(msg, type) =>
                        addToast({ message: msg, type: type || "info" })
                      }
                      isInitiallyCollapsed={true}
                    />
                    <TestOrdersPanel
                      brandId={brandId}
                      sessionId={sessionId}
                      lastToolEvent={lastToolEvent}
                      onSelectPrompt={handleSelectPrompt}
                      onToast={(msg, type) =>
                        addToast({ message: msg, type: type || "info" })
                      }
                    />
                  </>
                ) : (
                  <AgentBrainPanel
                    events={toolEvents}
                    detectedIntent={detectedIntent}
                    latency={latency}
                    onClear={clearToolEvents}
                    isMobileTab={true}
                  />
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Agent Brain Side Drawer (Desktop & Mobile Pop-out) ─ */}
      <AgentBrainPanel
        isOpen={isBrainOpen}
        onClose={() => setIsBrainOpen(false)}
        events={toolEvents}
        detectedIntent={detectedIntent}
        latency={latency}
        onClear={clearToolEvents}
      />

      {/* ── Call History Drawer ────────────────────────────── */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessionId={sessionId}
        onSelectCall={(call) => setSelectedHistoryCall(call)}
      />

      {/* ── Accessible Announcement Area ───────────────────── */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Current agent state: {state}. {isInCall ? "Call in progress." : "Call idle."}
      </div>
    </div>
  );
}
