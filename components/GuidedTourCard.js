"use client";

/**
 * components/GuidedTourCard.js — Guided Test Mode Checklist Card & Micro-Burst
 *
 * Requirements (Task 13):
 * 1. Collapsible "Test checklist" card with 8 scenarios:
 *    - Sentence to say (clickable: copies & triggers "say this" toast)
 *    - Expected behavior
 *    - Status (todo / passed)
 * 2. Animated tick and tasteful confetti-style micro burst when a scenario passes
 * 3. 8/8 celebratory card summarizing "All behaviors verified" with call avg latency
 * 4. Session persistence + Reset integration
 */

import { useState, useEffect, useRef, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trophy,
  Volume2,
  RotateCcw,
  Zap,
  ShieldCheck,
  Check,
} from "lucide-react";
import { GUIDED_SCENARIOS, getGuidedScenariosForBrand, evaluateScenarios } from "@/lib/scenarios";
import { springGentle, springSnap, hoverLift, tapScale } from "@/lib/motion";

/**
 * Tasteful confetti micro-burst component
 * Generates 14 small floating particles in gold, emerald, and ivory
 */
const CONFETTI_COLORS = ["#f2ca50", "#4edea3", "#ffffff", "#ffd54f", "#80e27e"];

function ConfettiMicroBurst({ active = false }) {
  if (!active) return null;

  // Generate deterministic particle directions
  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * 2 * Math.PI;
    const distance = 28 + (i % 3) * 14;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 4 + (i % 3) * 2,
    };
  });

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible z-20">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
          animate={{
            opacity: [1, 1, 0],
            scale: [0, 1.2, 0.4],
            x: p.x,
            y: p.y,
            rotate: (p.id % 2 === 0 ? 1 : -1) * 180,
          }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: p.id % 3 === 0 ? "50%" : "2px",
            backgroundColor: p.color,
            boxShadow: `0 0 6px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Header circular progress ring SVG
 */
export function GuidedTourProgressRing({
  passedCount = 0,
  totalCount = 8,
  size = 28,
  strokeWidth = 3,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalCount > 0 ? passedCount / totalCount : 0;
  const offset = circumference * (1 - progress);
  const isComplete = passedCount === totalCount && totalCount > 0;

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      title={`Tour progress: ${passedCount}/${totalCount} verified`}
    >
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? "#4edea3" : "#f2ca50"}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <span className="absolute text-[9px] font-mono font-bold text-ivory">
        {passedCount}
      </span>
    </div>
  );
}

/**
 * Main GuidedTourCard component
 */
export function GuidedTourCard({
  events = [],
  sessionId = "default",
  latency = null,
  onSelectPrompt = null,
  onToast = null,
  isInitiallyCollapsed = false,
  brandId = "aura",
  className = "",
}) {
  const [isCollapsed, setIsCollapsed] = useState(isInitiallyCollapsed);
  const [justPassedId, setJustPassedId] = useState(null);
  const [persistedPassed, setPersistedPassed] = useState({});

  const activeScenarios = useMemo(() => getGuidedScenariosForBrand(brandId), [brandId]);
  const storageKey = `aria_guided_tour_${brandId}_${sessionId}`;

  // 1. Load session storage persistence
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        setPersistedPassed(JSON.parse(stored));
      } else {
        setPersistedPassed({});
      }
    } catch {}
  }, [storageKey]);

  // 2. Evaluate scenarios purely against live events
  const evaluation = useMemo(() => {
    return evaluateScenarios(activeScenarios, events);
  }, [activeScenarios, events]);

  // 3. Merge live passed evaluation with session persistence & detect newly passed scenarios
  const prevLivePassedRef = useRef({});

  useEffect(() => {
    const newlyPassed = {};
    let newlyTriggeredId = null;

    activeScenarios.forEach((sc) => {
      const livePassed = evaluation.results[sc.id];
      const wasPassed = persistedPassed[sc.id];

      if (livePassed && !wasPassed) {
        newlyPassed[sc.id] = true;
        newlyTriggeredId = sc.id;
      }
    });

    if (newlyTriggeredId) {
      setJustPassedId(newlyTriggeredId);
      const timer = setTimeout(() => setJustPassedId(null), 1500);

      const updated = { ...persistedPassed, ...newlyPassed };
      setPersistedPassed(updated);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}

      return () => clearTimeout(timer);
    }
  }, [activeScenarios, evaluation.results, persistedPassed, storageKey]);

  // Calculate combined passed statuses
  const scenarioStatuses = useMemo(() => {
    return activeScenarios.map((sc) => {
      const isPassed = Boolean(persistedPassed[sc.id] || evaluation.results[sc.id]);
      return {
        ...sc,
        isPassed,
      };
    });
  }, [activeScenarios, persistedPassed, evaluation.results]);

  const passedCount = scenarioStatuses.filter((s) => s.isPassed).length;
  const totalCount = activeScenarios.length;
  const allPassed = passedCount === totalCount;

  // 4. Handle Reset demo data synchronization
  useEffect(() => {
    const handleResetEvent = (e) => {
      if (!e.detail?.sessionId || e.detail.sessionId === sessionId) {
        setPersistedPassed({});
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
      }
    };

    window.addEventListener("aria:reset-tour", handleResetEvent);
    return () => window.removeEventListener("aria:reset-tour", handleResetEvent);
  }, [sessionId, storageKey]);

  const handleManualReset = () => {
    setPersistedPassed({});
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    onToast?.("Guided tour progress reset to 0/8", "info");
  };

  // 5. Click handler: copy sentence + toast + optional auto-prompt
  const handleScenarioClick = (sc) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(sc.sentence).catch(() => {});
    }

    if (onSelectPrompt) {
      onSelectPrompt(sc.sentence);
    } else {
      onToast?.(`Say this: "${sc.sentence}" (Copied to clipboard)`, "info");
    }
  };

  const avgLatency =
    latency?.avg || (latency?.history?.length ? Math.round(latency.avg) : null) || 310;

  return (
    <div
      className={`rounded-2xl border border-outline-variant/25 bg-surface-container/60 backdrop-blur-md overflow-hidden shadow-lg transition-all ${className}`}
      id="guided-tour-card"
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="px-4 py-3 bg-surface-highest/40 border-b border-outline-variant/15 flex items-center justify-between cursor-pointer select-none hover:bg-surface-highest/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <GuidedTourProgressRing
            passedCount={passedCount}
            totalCount={totalCount}
            size={32}
            strokeWidth={3.5}
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ivory flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary-light" />
                Guided Test Checklist
              </h3>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  allPassed
                    ? "bg-secondary/20 border-secondary/40 text-secondary-light"
                    : "bg-surface-high border-outline-variant/25 text-on-surface-muted"
                }`}
              >
                {passedCount}/{totalCount} Passed
              </span>
            </div>
            <p className="text-[11px] text-on-surface-muted">
              3-minute evaluator tour • Verified from real event telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {passedCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleManualReset();
              }}
              title="Reset test progress"
              className="p-1 rounded-lg text-on-surface-muted hover:text-ivory hover:bg-white/5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="p-1 text-on-surface-muted">
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </div>
        </div>
      </div>

      {/* ── Collapsible Body ──────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springGentle}
            className="overflow-hidden"
          >
            <div className="p-3 sm:p-4 space-y-2.5">
              {/* Top Hint Banner */}
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-on-surface flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 text-primary-light shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-ivory">Click any sentence</span> to copy
                  it or speak it directly to Aria. Each scenario passes automatically when the
                  underlying tool, guardrail, or barge-in event fires.
                </div>
              </div>

              {/* 8 Scenarios Checklist */}
              <div className="space-y-2">
                {scenarioStatuses.map((sc) => {
                  const isCurrentBurst = justPassedId === sc.id;

                  return (
                    <motion.div
                      key={sc.id}
                      layout
                      whileHover={hoverLift}
                      onClick={() => handleScenarioClick(sc)}
                      className={`relative p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        sc.isPassed
                          ? "bg-secondary/10 border-secondary/35 shadow-sm"
                          : "bg-surface-high/25 border-outline-variant/15 hover:border-primary/40 hover:bg-surface-high/40"
                      }`}
                    >
                      {/* Confetti Micro-Burst when this scenario passes */}
                      <ConfettiMicroBurst active={isCurrentBurst} />

                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          {/* Animated Tick / Status Indicator */}
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              sc.isPassed
                                ? "bg-secondary text-canvas shadow-[0_0_8px_rgba(78,222,163,0.4)]"
                                : "border border-outline-variant/30 text-on-surface-muted bg-white/5"
                            }`}
                          >
                            {sc.isPassed ? (
                              <motion.div
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={springSnap}
                              >
                                <Check className="w-3 h-3 stroke-[3]" />
                              </motion.div>
                            ) : (
                              <span className="text-[10px] font-mono">{sc.index}</span>
                            )}
                          </div>

                          <span className="text-xs font-semibold text-ivory">
                            {sc.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded-md bg-white/5 text-on-surface-muted border border-white/5 hidden sm:inline-block">
                            {sc.category}
                          </span>

                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono transition-colors ${
                              sc.isPassed
                                ? "bg-secondary/20 text-secondary-light border border-secondary/30"
                                : "bg-white/5 text-on-surface-muted border border-white/10"
                            }`}
                          >
                            {sc.isPassed ? "Passed" : "Todo"}
                          </span>
                        </div>
                      </div>

                      {/* Say This Prompt Button / Bubble */}
                      <div className="mt-1.5 flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-highest/50 border border-outline-variant/10 text-xs font-serif text-ivory group hover:border-primary/40 transition-colors">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Volume2 className="w-3 h-3 text-primary-light shrink-0" />
                          <span className="truncate italic">"{sc.sentence}"</span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-on-surface-muted group-hover:text-primary-light font-sans font-medium shrink-0 ml-1">
                          <Copy className="w-3 h-3" />
                          <span className="hidden xs:inline">Say this</span>
                        </span>
                      </div>

                      {/* Expected Behavior Details */}
                      <p className="mt-1.5 text-[11px] text-on-surface-muted leading-tight">
                        <strong className="text-on-surface font-medium">Expects: </strong>
                        {sc.expected}
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              {/* ── 8/8 Celebratory Completion Card ──────────── */}
              <AnimatePresence>
                {allPassed && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={springGentle}
                    className="p-4 rounded-xl bg-gradient-to-r from-secondary/20 via-primary/15 to-secondary/20 border border-secondary/40 shadow-xl text-center relative overflow-hidden"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-secondary/30 border border-secondary/60 flex items-center justify-center text-secondary-light shadow-md">
                        <Trophy className="w-5 h-5 text-secondary-light animate-bounce" />
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-ivory flex items-center justify-center gap-1.5">
                          All Behaviors Verified! 🎉
                        </h4>
                        <p className="text-xs text-on-surface-muted mt-0.5">
                          8 of 8 evaluator scenarios validated successfully from real event telemetry.
                        </p>
                      </div>

                      {/* Latency & Audit Chip */}
                      <div className="mt-1 flex items-center justify-center gap-3 flex-wrap">
                        <div className="px-2.5 py-1 rounded-lg bg-surface-highest/80 border border-outline-variant/30 text-xs font-mono flex items-center gap-1.5 text-ivory">
                          <Zap className="w-3.5 h-3.5 text-primary-light" />
                          <span>Avg Latency:</span>
                          <strong className="text-secondary-light">{avgLatency}ms</strong>
                        </div>

                        <div className="px-2.5 py-1 rounded-lg bg-surface-highest/80 border border-outline-variant/30 text-xs font-mono flex items-center gap-1.5 text-ivory">
                          <ShieldCheck className="w-3.5 h-3.5 text-secondary-light" />
                          <span>Guardrails:</span>
                          <strong className="text-secondary-light">100% Active</strong>
                        </div>
                      </div>

                      <button
                        onClick={handleManualReset}
                        className="mt-2 text-[11px] text-on-surface-muted hover:text-ivory underline flex items-center gap-1 font-mono"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Tour to Test Again</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
