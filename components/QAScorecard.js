"use client";

/**
 * components/QAScorecard.js — Automated Call QA Scorecard Card
 *
 * Requirements (Task 17):
 * 1. Scores the call 1-5 on:
 *    - policy_adherence
 *    - accuracy_of_information
 *    - empathy_and_tone
 *    - conciseness
 *    - resolution_effectiveness
 * 2. unsupported_promise_detected: red flag banner if true
 * 3. coaching_note: one-line coaching note
 * 4. Animated radial gauge and animated score bars (Framer Motion)
 * 5. Non-blocking & optional: displays animated skeleton state while loading
 */

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Award,
  CheckCircle2,
  HelpCircle,
  ThumbsUp,
  Flame,
  Info,
} from "lucide-react";
import { springGentle, springSnap, fadeIn, fadeUp, staggerContainer, staggerItem } from "@/lib/motion";

const SCORE_CATEGORIES = [
  { key: "policy_adherence", label: "Policy Adherence", desc: "Return window & cancellation rules" },
  { key: "accuracy_of_information", label: "Accuracy of Info", desc: "Grounded in tool execution" },
  { key: "empathy_and_tone", label: "Empathy & Tone", desc: "Warmth & professional courtesy" },
  { key: "conciseness", label: "Conciseness", desc: "Brevity & clear messaging" },
  { key: "resolution_effectiveness", label: "Resolution Effectiveness", desc: "Actionable outcome achieved" },
];

export function QAScorecard({ qa, loading = false, className = "" }) {
  // Compute overall average score from available non-null scores
  const { overallScore, validCount } = useMemo(() => {
    if (!qa) return { overallScore: null, validCount: 0 };
    const scores = [
      qa.policy_adherence,
      qa.accuracy_of_information,
      qa.empathy_and_tone,
      qa.conciseness,
      qa.resolution_effectiveness,
    ].filter((v) => typeof v === "number" && !isNaN(v));

    if (scores.length === 0) return { overallScore: null, validCount: 0 };
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { overallScore: Number(avg.toFixed(1)), validCount: scores.length };
  }, [qa]);

  // Color helper based on score
  const getScoreColor = (val) => {
    if (val === null || val === undefined) return "text-on-surface-muted";
    if (val >= 4.5) return "text-emerald-400";
    if (val >= 3.5) return "text-amber-400";
    return "text-rose-400";
  };

  const getBarColor = (val) => {
    if (val === null || val === undefined) return "#64748b";
    if (val >= 4) return "#10b981"; // emerald
    if (val >= 3) return "#f59e0b"; // amber
    return "#f43f5e"; // rose
  };

  // Radial SVG calculation (radius 36, stroke 7)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const scorePercent = overallScore ? Math.min(100, Math.max(0, (overallScore / 5) * 100)) : 0;
  const strokeDashoffset = circumference - (circumference * scorePercent) / 100;

  // ── 1. Loading Skeleton State (Non-Blocking) ──────────────────────────────
  if (loading) {
    return (
      <div className={`rounded-3xl p-6 border border-outline-variant/20 bg-surface-container/60 backdrop-blur-xl shadow-lg animate-pulse ${className}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <div className="h-4 w-44 bg-surface-highest/80 rounded-md mb-1.5" />
              <div className="h-3 w-64 bg-surface-highest/50 rounded-md" />
            </div>
          </div>
          <div className="h-5 w-20 bg-surface-highest/60 rounded-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Shimmer Radial */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4">
            <div className="w-24 h-24 rounded-full border-4 border-surface-highest/50 flex items-center justify-center">
              <div className="h-5 w-12 bg-surface-highest/70 rounded-md" />
            </div>
            <div className="h-3 w-28 bg-surface-highest/40 rounded-md mt-3" />
          </div>

          {/* Shimmer Bars */}
          <div className="md:col-span-8 space-y-3.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <div className="h-3 w-32 bg-surface-highest/60 rounded" />
                  <div className="h-3 w-8 bg-surface-highest/60 rounded" />
                </div>
                <div className="h-2 w-full bg-surface-highest/40 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 p-3.5 rounded-2xl bg-surface-highest/30 border border-outline-variant/10 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-primary animate-spin" />
          <span className="text-xs text-on-surface-muted font-mono">
            Auditing conversation quality, tool grounding & policy adherence...
          </span>
        </div>
      </div>
    );
  }

  // ── 2. Fallback / Skipped State (Nulls) ────────────────────────────────────
  if (!qa || validCount === 0) {
    return (
      <div className={`rounded-3xl p-6 border border-outline-variant/20 bg-surface-container/60 backdrop-blur-xl shadow-lg ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-surface-high border border-outline-variant/30 flex items-center justify-center text-on-surface-muted">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
                Automatic QA Scorecard
              </h3>
              <span className="text-[11px] text-on-surface-muted">
                Quality evaluation pending or unavailable
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-on-surface-muted italic">
          {qa?.coaching_note || "QA evaluation was skipped or returned null metrics for this session."}
        </p>
      </div>
    );
  }

  const isFlagged = Boolean(qa.unsupported_promise_detected);

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={`rounded-3xl p-6 border ${
        isFlagged
          ? "border-rose-500/40 bg-rose-500/[0.04] shadow-rose-950/20 shadow-xl"
          : "border-outline-variant/20 bg-surface-container/60"
      } backdrop-blur-xl shadow-lg ${className}`}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              isFlagged
                ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                : "bg-primary/20 border-primary/30 text-primary-light"
            }`}
          >
            {isFlagged ? <AlertTriangle className="w-4 h-4" /> : <Award className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
                Automatic QA Scorecard
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-primary/10 text-primary-light border border-primary/20">
                AI Evaluated
              </span>
            </div>
            <span className="text-[11px] text-on-surface-muted">
              Scored on 5 core support dimensions against Aura business rules
            </span>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2">
          {isFlagged ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              Flagged Call
            </span>
          ) : overallScore >= 4.5 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Exemplary Service
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Standard Compliance
            </span>
          )}
        </div>
      </div>

      {/* ── Red Flag Banner (if unsupported_promise_detected) ─────────────── */}
      <AnimatePresence>
        {isFlagged && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-5 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex items-start gap-3 shadow-md"
          >
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-rose-100 flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                Unsupported Verbal Promise Flagged
              </div>
              <p className="mt-0.5 text-rose-200/90 leading-relaxed font-sans">
                Aria committed to an unverified exception, refund guarantee, or delivery timeline that was{" "}
                <span className="font-medium underline decoration-rose-400/50">not grounded in database records</span> or authorized by Aura business policy.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Body: Radial Meter + 5 Dimension Score Bars ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Radial Meter (4 cols) */}
        <div className="md:col-span-4 flex flex-col items-center justify-center p-3 rounded-2xl bg-black/20 border border-white/5">
          <div className="relative w-28 h-28 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 88 88">
              {/* Background Track */}
              <circle
                cx="44"
                cy="44"
                r={radius}
                className="stroke-surface-highest/60"
                strokeWidth="7"
                fill="transparent"
              />
              {/* Animated Progress Ring */}
              <motion.circle
                cx="44"
                cy="44"
                r={radius}
                stroke={isFlagged ? "#f43f5e" : overallScore >= 4 ? "#10b981" : "#f59e0b"}
                strokeWidth="7"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={springGentle}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className={`font-mono text-2xl font-bold tracking-tight ${getScoreColor(overallScore)}`}>
                {overallScore ? overallScore.toFixed(1) : "—"}
              </span>
              <span className="text-[10px] font-mono text-on-surface-muted uppercase tracking-wider">
                out of 5.0
              </span>
            </div>
          </div>

          <div className="text-center mt-2">
            <span className="text-xs font-semibold text-ivory block">
              Overall Quality Score
            </span>
            <span className="text-[10px] text-on-surface-muted font-mono">
              Composite QA Rating
            </span>
          </div>
        </div>

        {/* 5 Dimension Score Bars (8 cols) */}
        <div className="md:col-span-8 space-y-3">
          {SCORE_CATEGORIES.map(({ key, label, desc }) => {
            const val = qa[key];
            const num = typeof val === "number" ? val : 0;
            const pct = (num / 5) * 100;
            const barColor = getBarColor(num);

            return (
              <div key={key} className="group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div>
                    <span className="font-medium text-ivory text-xs group-hover:text-primary-light transition-colors">
                      {label}
                    </span>
                    <span className="hidden sm:inline-block text-[10px] text-on-surface-muted ml-2 font-sans">
                      • {desc}
                    </span>
                  </div>
                  <div className="font-mono text-xs font-semibold flex items-center gap-1">
                    <span className={getScoreColor(num)}>{num}</span>
                    <span className="text-on-surface-muted text-[10px]">/ 5</span>
                  </div>
                </div>

                {/* Progress Bar Track */}
                <div className="h-2 w-full bg-surface-highest/60 rounded-full overflow-hidden p-0.5 border border-outline-variant/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={springGentle}
                    className="h-full rounded-full"
                    style={{ backgroundColor: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Coaching Note Callout Box ────────────────────────────────────── */}
      {qa.coaching_note && (
        <div className="mt-5 p-4 rounded-2xl bg-surface-highest/40 border border-outline-variant/15 flex items-start gap-3">
          <div className="w-6 h-6 rounded-lg bg-secondary/20 border border-secondary/30 flex items-center justify-center text-secondary-light shrink-0 mt-0.5">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-secondary-light font-semibold block mb-0.5">
              Auditor Coaching Note
            </span>
            <p className="text-xs text-ivory/90 leading-relaxed font-sans italic">
              &ldquo;{qa.coaching_note}&rdquo;
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
