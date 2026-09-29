"use client";

/**
 * app/insights/page.js — Aura Skincare Aria Analytics & Evaluation Dashboard
 *
 * Requirements:
 * 1. Animated KPI cards (count-up)
 * 2. Donut chart (Resolution status breakdown)
 * 3. Bar chart (Customer intents breakdown)
 * 4. Line / Area chart (Daily calls trend)
 * 5. Latency histogram (Response latency distribution)
 * 6. Recent calls table with row hover animation and detail modal (collapses into cards on mobile)
 * 7. Skeleton loading & empty state with "Make a test call" link
 * 8. Scaling notes card (5 concrete things that change at 1,000 calls/day)
 * 9. Shared Navbar with animated active indicator
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneCall,
  Clock,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Calendar,
  Sparkles,
  RefreshCw,
  X,
  FileText,
  User,
  Bot,
  ExternalLink,
  ShieldCheck,
  Server,
  Layers,
  Cpu,
  Radio,
  ArrowRight,
  Award,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/Navbar";

// Dynamically import heavy chart components
const ResolutionDonutChart = dynamic(
  () => import("@/components/InsightsCharts").then((m) => m.ResolutionDonutChart),
  { ssr: false }
);
const IntentsBarChart = dynamic(
  () => import("@/components/InsightsCharts").then((m) => m.IntentsBarChart),
  { ssr: false }
);
const CallsTrendAreaChart = dynamic(
  () => import("@/components/InsightsCharts").then((m) => m.CallsTrendAreaChart),
  { ssr: false }
);
const LatencyHistogramChart = dynamic(
  () => import("@/components/InsightsCharts").then((m) => m.LatencyHistogramChart),
  { ssr: false }
);
const QATrendLineChart = dynamic(
  () => import("@/components/InsightsCharts").then((m) => m.QATrendLineChart),
  { ssr: false }
);
import { Badge } from "@/components/ui";
import {
  fadeUp,
  fadeIn,
  scaleIn,
  springGentle,
  staggerContainer,
  staggerItem,
  tapScale,
  hoverLift,
} from "@/lib/motion";

// ── 1. Animated Count-Up Number ──────────────────────────────────────────────
function AnimatedNumber({ value, duration = 800, suffix = "" }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    if (target === 0) {
      setDisplayValue(0);
      return;
    }
    let startTimestamp = null;
    let frameId;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(easeOut * target));

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [value, duration]);

  return (
    <span>
      {displayValue}
      {suffix}
    </span>
  );
}

function formatSeconds(secs = 0) {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function InsightsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCall, setSelectedCall] = useState(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights");
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load insights data");
      }
    } catch (err) {
      console.error("[insights] Failed to fetch insights:", err);
      setError(err?.message || "Network error loading analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-canvas text-on-surface font-sans selection:bg-primary/20 selection:text-primary">
      {/* ── Top Nav with Animated Active Indicator ────────────────── */}
      <Navbar mode="realtime" />

      {/* ── Main Dashboard Stage ──────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
        {/* ── Header Headline & Quick Refresh ───────────────────────── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono uppercase tracking-wider text-primary-light bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
                Evaluation & Analytics
              </span>
              <span className="text-xs text-on-surface-muted font-mono">
                Production Telemetry
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ivory tracking-tight">
              Aria Voice Intelligence Dashboard
            </h1>
            <p className="text-xs text-on-surface-muted mt-1 max-w-xl">
              Live operational metrics, intent classification distribution, latency
              histograms, and call audit logs across Aura Skincare voice sessions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={fetchInsights}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-on-surface bg-surface-container border border-outline-variant/30 hover:bg-surface-high transition-colors shadow-sm"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Metrics</span>
            </motion.button>

            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-canvas bg-primary hover:bg-primary-light text-black transition-all shadow-md shadow-primary/20"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Make Test Call</span>
            </Link>
          </div>
        </motion.div>

        {/* ── Loading Skeleton State ────────────────────────────────── */}
        {loading && !data && (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-surface-container/60 border border-outline-variant/10" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 rounded-3xl bg-surface-container/60 border border-outline-variant/10" />
              <div className="h-64 rounded-3xl bg-surface-container/60 border border-outline-variant/10" />
            </div>
          </div>
        )}

        {/* ── Error State ───────────────────────────────────────────── */}
        {error && !loading && (
          <div className="rounded-3xl p-8 bg-rose-500/10 border border-rose-500/25 text-center max-w-md mx-auto my-12 space-y-4">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
            <h3 className="font-serif text-lg font-medium text-ivory">
              Unable to Load Analytics
            </h3>
            <p className="text-xs text-on-surface-muted leading-relaxed">{error}</p>
            <button
              onClick={fetchInsights}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-surface-high border border-outline-variant/30 text-ivory hover:border-primary/40 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Empty State ───────────────────────────────────────── */}
        {data && data.totalCalls === 0 && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="rounded-3xl p-12 bg-surface-container/60 border border-outline-variant/15 backdrop-blur-xl text-center max-w-lg mx-auto my-8 space-y-4 shadow-xl"
          >
            <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto text-primary-light">
              <PhoneCall className="w-8 h-8 opacity-60" />
            </div>
            <h3 className="font-serif text-2xl font-medium text-ivory">
              No Voice Consultations Recorded Yet
            </h3>
            <p className="text-xs text-on-surface-muted leading-relaxed max-w-sm mx-auto">
              Once customers or evaluators speak with Aria, live telemetry, resolution rates,
              intent classification, and latency percentiles will automatically populate here.
            </p>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-canvas bg-primary hover:bg-primary-light text-black transition-all shadow-md shadow-primary/20"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Make a test call</span>
              </Link>
            </div>
          </motion.div>
        )}

        {/* ── Dashboard Content ─────────────────────────────────────── */}
        {data && data.totalCalls > 0 && (
          <motion.div
            variants={staggerContainer(0.06, 0.05)}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-8"
          >
            {/* ── 1. Animated KPI Cards ───────────────────────────────── */}
            <motion.section
              variants={staggerItem}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5"
            >
              {/* Total Calls */}
              <div className="p-4 rounded-2xl bg-surface-container/70 border border-outline-variant/15 flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between text-on-surface-muted mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider">
                    Total Calls
                  </span>
                  <PhoneCall className="w-4 h-4 text-primary-light" />
                </div>
                <div className="font-mono text-2xl font-bold text-ivory">
                  <AnimatedNumber value={data.totalCalls} />
                </div>
                <span className="text-[10px] text-on-surface-muted font-mono mt-1">
                  all-time recorded
                </span>
              </div>

              {/* Calls Today */}
              <div className="p-4 rounded-2xl bg-surface-container/70 border border-outline-variant/15 flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between text-on-surface-muted mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider">
                    Calls Today
                  </span>
                  <Calendar className="w-4 h-4 text-secondary-light" />
                </div>
                <div className="font-mono text-2xl font-bold text-ivory">
                  <AnimatedNumber value={data.callsToday} />
                </div>
                <span className="text-[10px] text-on-surface-muted font-mono mt-1">
                  current date window
                </span>
              </div>

              {/* Average Duration */}
              <div className="p-4 rounded-2xl bg-surface-container/70 border border-outline-variant/15 flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between text-on-surface-muted mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider">
                    Avg Duration
                  </span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="font-mono text-2xl font-bold text-ivory">
                  {formatSeconds(data.avgDuration)}
                </div>
                <span className="text-[10px] text-on-surface-muted font-mono mt-1">
                  {data.avgDuration}s per consultation
                </span>
              </div>

              {/* Median Response Latency (p50) */}
              <div className="p-4 rounded-2xl bg-surface-container/70 border border-outline-variant/15 flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between text-on-surface-muted mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider">
                    p50 Latency
                  </span>
                  <Zap className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="font-mono text-2xl font-bold text-ivory">
                  <AnimatedNumber value={data.p50Latency} suffix="ms" />
                </div>
                <span className="text-[10px] text-on-surface-muted font-mono mt-1">
                  median turn response
                </span>
              </div>

              {/* 95th Percentile Latency (p95) */}
              <div className="p-4 rounded-2xl bg-surface-container/70 border border-outline-variant/15 flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between text-on-surface-muted mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider">
                    p95 Latency
                  </span>
                  <Zap className="w-4 h-4 text-orange-400" />
                </div>
                <div className="font-mono text-2xl font-bold text-ivory">
                  <AnimatedNumber value={data.p95Latency} suffix="ms" />
                </div>
                <span className="text-[10px] text-on-surface-muted font-mono mt-1">
                  tail SLA threshold
                </span>
              </div>

              {/* Tool Error Rate */}
              <div className="p-4 rounded-2xl bg-surface-container/70 border border-outline-variant/15 flex flex-col justify-between shadow-sm">
                <div className="flex items-center justify-between text-on-surface-muted mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider">
                    Tool Errors
                  </span>
                  <Wrench className="w-4 h-4 text-purple-400" />
                </div>
                <div className="font-mono text-2xl font-bold text-ivory">
                  {data.toolErrorRate}%
                </div>
                <span className="text-[10px] text-on-surface-muted font-mono mt-1">
                  {data.totalToolInvocations || 0} tool calls executed
                </span>
              </div>
            </motion.section>

            {/* ── 1.5 QA Scorecard KPI Summary Bar (Task 17) ─────────── */}
            {data.qaAverages && (
              <motion.section
                variants={staggerItem}
                className="p-5 sm:p-6 rounded-3xl bg-surface-container/70 border border-outline-variant/20 backdrop-blur-xl shadow-lg"
              >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary-light">
                      <Award className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
                          Automated QA Quality & Compliance Benchmarks
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {data.qaAverages.evaluatedCallsCount || data.totalCalls} Calls Audited
                        </span>
                      </div>
                      <span className="text-[11px] text-on-surface-muted">
                        Evaluated across policy adherence, information accuracy, and tone
                      </span>
                    </div>
                  </div>

                  {data.qaAverages.flaggedCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {data.qaAverages.flaggedCount} Flagged Call{data.qaAverages.flaggedCount === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Zero Flagged Promises
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                  <div className="p-3.5 rounded-2xl bg-black/25 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-on-surface-muted uppercase">Overall QA</span>
                    <div className="font-mono text-xl font-bold text-emerald-400 mt-1">
                      {data.qaAverages.overallScore} <span className="text-xs text-on-surface-muted font-normal">/ 5.0</span>
                    </div>
                    <span className="text-[10px] text-on-surface-muted">composite score</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/25 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-on-surface-muted uppercase">Policy Adherence</span>
                    <div className="font-mono text-xl font-bold text-ivory mt-1">
                      {data.qaAverages.policyAdherence} <span className="text-xs text-on-surface-muted font-normal">/ 5.0</span>
                    </div>
                    <span className="text-[10px] text-on-surface-muted">return & cancel rules</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/25 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-on-surface-muted uppercase">Info Accuracy</span>
                    <div className="font-mono text-xl font-bold text-ivory mt-1">
                      {data.qaAverages.accuracy} <span className="text-xs text-on-surface-muted font-normal">/ 5.0</span>
                    </div>
                    <span className="text-[10px] text-on-surface-muted">grounded in tools</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/25 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-on-surface-muted uppercase">Empathy & Tone</span>
                    <div className="font-mono text-xl font-bold text-ivory mt-1">
                      {data.qaAverages.empathy} <span className="text-xs text-on-surface-muted font-normal">/ 5.0</span>
                    </div>
                    <span className="text-[10px] text-on-surface-muted">courtesy & warmth</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/25 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-on-surface-muted uppercase">Conciseness</span>
                    <div className="font-mono text-xl font-bold text-ivory mt-1">
                      {data.qaAverages.conciseness} <span className="text-xs text-on-surface-muted font-normal">/ 5.0</span>
                    </div>
                    <span className="text-[10px] text-on-surface-muted">turn brevity</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/25 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-on-surface-muted uppercase">Resolution</span>
                    <div className="font-mono text-xl font-bold text-ivory mt-1">
                      {data.qaAverages.resolution} <span className="text-xs text-on-surface-muted font-normal">/ 5.0</span>
                    </div>
                    <span className="text-[10px] text-on-surface-muted">outcome achieved</span>
                  </div>
                </div>
              </motion.section>
            )}

            {/* ── 2. Primary Charts Grid (Donut & Bar) ────────────────── */}
            <motion.section
              variants={staggerItem}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
            >
              {/* Donut: Resolution Status Breakdown (5 Cols) */}
              <div className="lg:col-span-5 h-full">
                <ResolutionDonutChart data={data.resolutionBreakdown} />
              </div>

              {/* Bar: Customer Intents Breakdown (7 Cols) */}
              <div className="lg:col-span-7 h-full">
                <IntentsBarChart data={data.intentBreakdown} />
              </div>
            </motion.section>

            {/* ── 3. Secondary Charts Grid (Trend & Histogram) ────────── */}
            <motion.section
              variants={staggerItem}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
            >
              {/* Line / Area: Daily Calls Trend (6 Cols) */}
              <div className="lg:col-span-6 h-full">
                <CallsTrendAreaChart data={data.callsPerDay} />
              </div>

              {/* Line / Area: QA Quality Score Trend (6 Cols) (Task 17) */}
              <div className="lg:col-span-6 h-full">
                <QATrendLineChart data={data.qaTrend} />
              </div>
            </motion.section>

            {/* ── 3.5 Latency Distribution Histogram ─────────────────── */}
            <motion.section variants={staggerItem}>
              <LatencyHistogramChart data={data.latencyHistogram} />
            </motion.section>

            {/* ── 3.8 Flagged Calls Audit List (Task 17) ─────────────── */}
            {data.flaggedCalls && data.flaggedCalls.length > 0 && (
              <motion.section
                variants={staggerItem}
                className="rounded-3xl p-6 sm:p-8 bg-rose-500/[0.04] border border-rose-500/30 backdrop-blur-xl shadow-lg"
              >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-medium text-rose-100 tracking-tight">
                        Flagged Calls Audit
                      </h3>
                      <p className="text-xs text-rose-200/80">
                        Calls flagged for ungrounded verbal guarantees or policy overrides
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {data.flaggedCalls.length} Call{data.flaggedCalls.length === 1 ? "" : "s"} Requiring Review
                  </span>
                </div>

                <div className="space-y-3">
                  {data.flaggedCalls.map((fc) => (
                    <div
                      key={fc.id}
                      className="p-4 rounded-2xl bg-black/40 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono font-semibold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
                            {fc.id}
                          </code>
                          <span className="text-xs text-on-surface-muted font-mono">
                            {new Date(fc.startedAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-surface-highest/60 text-ivory font-mono">
                            {fc.customerIntent}
                          </span>
                          {fc.orderId && (
                            <span className="text-xs text-primary font-mono">
                              {fc.orderId}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-rose-200/90 italic font-sans mt-1">
                          &ldquo;{fc.coachingNote}&rdquo;
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-on-surface-muted uppercase font-mono block">
                            Policy Score
                          </span>
                          <span className="font-mono text-sm font-bold text-rose-400">
                            {fc.qaScores?.policyAdherence || 1} / 5
                          </span>
                        </div>

                        <Link
                          href={`/call/${fc.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 border border-rose-500/40 transition-colors"
                        >
                          <span>Audit Report</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* ── 4. Recent Calls Table with Row Hover & Detail Modal ─── */}
            <motion.section
              variants={staggerItem}
              className="rounded-3xl p-6 sm:p-8 bg-surface-container/60 border border-outline-variant/15 backdrop-blur-xl shadow-lg"
            >
              <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <div>
                  <h3 className="font-serif text-xl font-medium text-ivory tracking-tight">
                    Recent Voice Consultations
                  </h3>
                  <p className="text-xs text-on-surface-muted">
                    Sanitized audit trail of the last 10 completed customer calls (no customer PII)
                  </p>
                </div>
                <span className="text-xs font-mono text-primary-light">
                  Showing {data.recentCalls?.length || 0} calls
                </span>
              </div>

              {/* Desktop Table View (Hidden on mobile) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/15 text-[11px] font-mono uppercase tracking-wider text-on-surface-muted">
                      <th className="py-3 px-3">Call ID</th>
                      <th className="py-3 px-3">Mode</th>
                      <th className="py-3 px-3">Intent</th>
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-3">Resolution</th>
                      <th className="py-3 px-3">Duration</th>
                      <th className="py-3 px-3">Latency</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-xs">
                    {data.recentCalls.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCall(c)}
                        className="hover:bg-surface-highest/60 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-3 font-mono text-on-surface-muted group-hover:text-primary-light">
                          {c.id.slice(0, 14)}...
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-surface-highest border border-outline-variant/20">
                            {c.mode}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-medium text-ivory">
                          {c.customerIntent}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-secondary-light">
                          {c.orderId || "—"}
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                              c.resolutionStatus === "RESOLVED"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : c.resolutionStatus === "POLICY_DECLINED"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : c.resolutionStatus === "ESCALATION_NEEDED"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-surface-highest text-on-surface-muted border-outline-variant/20"
                            }`}
                          >
                            {c.resolutionStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono">
                          {formatSeconds(c.durationSeconds)}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-on-surface-muted">
                          {c.latencyMs > 0 ? `${c.latencyMs}ms` : "—"}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-on-surface-muted">
                          {new Date(c.startedAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <span className="text-xs text-primary-light group-hover:underline inline-flex items-center gap-1">
                            Inspect <ExternalLink className="w-3 h-3" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View (Collapses on small screens) */}
              <div className="md:hidden space-y-3">
                {data.recentCalls.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCall(c)}
                    className="p-4 rounded-2xl bg-surface-container/80 border border-outline-variant/15 active:bg-surface-highest transition-colors space-y-2 cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center justify-between text-xs font-mono text-on-surface-muted">
                      <span>{new Date(c.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="uppercase text-[10px] px-2 py-0.5 rounded-md bg-surface-highest">
                        {c.mode}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ivory text-sm">
                        {c.customerIntent}
                      </span>
                      {c.orderId && (
                        <span className="font-mono text-xs text-secondary-light">
                          {c.orderId}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          c.resolutionStatus === "RESOLVED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : c.resolutionStatus === "POLICY_DECLINED"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-surface-highest text-on-surface-muted border-outline-variant/20"
                        }`}
                      >
                        {c.resolutionStatus}
                      </span>
                      <span className="font-mono text-on-surface-muted">
                        {formatSeconds(c.durationSeconds)} • {c.latencyMs}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          </motion.div>
        )}

        {/* ── 5. Scaling Notes Card (5 Concrete Things at 1,000 Calls/Day) ── */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="rounded-3xl p-6 sm:p-8 bg-surface-container/70 border border-outline-variant/25 backdrop-blur-xl shadow-xl relative overflow-hidden"
        >
          <div
            className="absolute -right-24 -top-24 w-80 h-80 rounded-full pointer-events-none opacity-15 blur-3xl"
            style={{ background: "radial-gradient(circle, #f2ca50 0%, transparent 70%)" }}
          />

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary-light" />
            </div>
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-medium text-ivory tracking-tight">
                Aria Architecture at 1,000 Calls/Day: 5 Scaling Milestones
              </h3>
              <p className="text-xs text-on-surface-muted">
                Engineering requirements, bottlenecks, and infrastructure adaptations for high-throughput voice AI (feeds README)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Note 1 */}
            <div className="p-4 rounded-2xl bg-surface-highest/40 border border-outline-variant/15 flex flex-col justify-between space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-primary-light">
                <Radio className="w-4 h-4 text-primary-light shrink-0" />
                <span>1. WebRTC & Socket Concurrency</span>
              </div>
              <p className="text-xs text-on-surface-muted leading-relaxed">
                At peak Indian business hours, 1,000 calls/day translates to 15–25 concurrent bidirectional PCM streams. Ephemeral tokens must be requested with jittered token pools and proxy keepalives to prevent WebSocket connection storming and upstream 429 quota exhaustion.
              </p>
            </div>

            {/* Note 2 */}
            <div className="p-4 rounded-2xl bg-surface-highest/40 border border-outline-variant/15 flex flex-col justify-between space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-secondary-light">
                <Server className="w-4 h-4 text-secondary-light shrink-0" />
                <span>2. Connection Pooling & Read Replicas</span>
              </div>
              <p className="text-xs text-on-surface-muted leading-relaxed">
                Serverless tool execution (`/api/tools/*`) will saturate Neon's default direct connection ceiling. Transitioning to transaction-mode PgBouncer connection pooling with dedicated read replicas for `/insights` analytics prevents analytical rollups from starving live order lookups.
              </p>
            </div>

            {/* Note 3 */}
            <div className="p-4 rounded-2xl bg-surface-highest/40 border border-outline-variant/15 flex flex-col justify-between space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-amber-400">
                <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
                <span>3. Multi-Engine Upstream Failover</span>
              </div>
              <p className="text-xs text-on-surface-muted leading-relaxed">
                A single API key on Gemini Live encounters quota spikes during heavy demand (503s). Production scaling requires multi-project enterprise Vertex AI quota reservation across multi-region clusters (US, EU, Asia-South) with sub-100ms automatic circuit breakers to Groq Llama.
              </p>
            </div>

            {/* Note 4 */}
            <div className="p-4 rounded-2xl bg-surface-highest/40 border border-outline-variant/15 flex flex-col justify-between space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>4. Audio Ingest & Edge Relays</span>
              </div>
              <p className="text-xs text-on-surface-muted leading-relaxed">
                At 16 kHz mono 16-bit PCM ingest (32 KB/s) and 24 kHz output (48 KB/s), aggregate daily bandwidth is ~7.2 GB/day. Deploying regional edge relays (Cloudflare Workers / Fastly) reduces TCP round-trip latency to under 30ms for customers in tier-1/tier-2 Indian cities.
              </p>
            </div>

            {/* Note 5 */}
            <div className="p-4 rounded-2xl bg-surface-highest/40 border border-outline-variant/15 flex flex-col justify-between space-y-2 md:col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-purple-400">
                <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                <span>5. Decoupled Asynchronous Evaluation Queues</span>
              </div>
              <p className="text-xs text-on-surface-muted leading-relaxed">
                Running structured post-call Gemini summaries synchronously on client hangup blocks serverless compute and causes UI lag. At scale, call events and transcripts are pushed to an asynchronous Redis / BullMQ message queue, evaluated in batch, and published directly to Aura's CRM (Zendesk / Freshdesk) webhooks.
              </p>
            </div>
          </div>
        </motion.section>
      </main>

      {/* ── Call Detail Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedCall && (
          <>
            <motion.div
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setSelectedCall(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
            />

            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[640px] max-h-[85vh] bg-surface-container/95 backdrop-blur-2xl border border-outline-variant/30 rounded-3xl z-50 flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-outline-variant/15 bg-surface/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-primary-light" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-medium text-ivory">
                      Consultation Details
                    </h3>
                    <p className="text-[11px] text-on-surface-muted font-mono">
                      Call ID: {selectedCall.id}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCall(null)}
                  className="p-2 rounded-xl text-on-surface-muted hover:text-ivory hover:bg-surface-high transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                {/* Meta summary badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-light font-mono font-medium">
                    {selectedCall.customerIntent}
                  </span>
                  {selectedCall.orderId && (
                    <span className="px-2.5 py-1 rounded-full bg-surface-highest border border-outline-variant/25 text-ivory font-mono font-semibold">
                      {selectedCall.orderId}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-full bg-surface-highest border border-outline-variant/20 text-on-surface-muted font-medium">
                    {selectedCall.resolutionStatus}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-highest border border-outline-variant/20 text-on-surface-muted font-mono ml-auto">
                    {formatSeconds(selectedCall.durationSeconds)} duration
                  </span>
                </div>

                {/* Summary quote */}
                <div className="p-4 rounded-2xl bg-surface-highest/40 border border-outline-variant/15 space-y-1">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-on-surface-muted">
                    Evaluated Summary
                  </div>
                  <p className="text-ivory leading-relaxed text-sm font-serif">
                    "{selectedCall.callSummary}"
                  </p>
                </div>

                {/* Policy Notes if present */}
                {selectedCall.policyNotes && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-on-surface">
                    <div className="text-[10px] uppercase font-mono text-amber-300 font-semibold mb-1">
                      Brand Policy Note
                    </div>
                    <p className="text-xs leading-relaxed">{selectedCall.policyNotes}</p>
                  </div>
                )}

                {/* Actions Taken */}
                {selectedCall.actionsTaken?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase font-mono text-on-surface-muted tracking-wider mb-2">
                      Grounded Actions Taken
                    </div>
                    <ul className="space-y-1.5">
                      {selectedCall.actionsTaken.map((act, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 p-2 rounded-lg bg-surface-highest/30 border border-outline-variant/10 text-on-surface"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-secondary-light shrink-0" />
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Transcript Snippet */}
                {selectedCall.transcript?.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] uppercase font-mono text-on-surface-muted tracking-wider mb-2">
                      Conversation Transcript ({selectedCall.transcript.length} turns)
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {selectedCall.transcript.map((t, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
                            t.speaker === "user"
                              ? "bg-surface-highest/40 border-outline-variant/15 ml-4"
                              : "bg-primary/5 border-primary/15 mr-4 text-ivory"
                          }`}
                        >
                          <div className="text-[10px] font-semibold text-on-surface-muted mb-0.5">
                            {t.speaker === "user" ? "Customer" : "Aria"}
                          </div>
                          <p>{t.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-outline-variant/15 bg-surface/30 flex items-center justify-between text-xs text-on-surface-muted font-mono">
                <span>Session: {selectedCall.sessionId}</span>
                <button
                  onClick={() => setSelectedCall(null)}
                  className="px-3 py-1.5 rounded-lg bg-surface-highest border border-outline-variant/25 text-ivory hover:border-primary/40 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
