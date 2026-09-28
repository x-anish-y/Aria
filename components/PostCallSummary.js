"use client";

/**
 * components/PostCallSummary.js — Post-call Evaluation & History Dashboard
 *
 * Requirements:
 * 1. Staggered reveal animations
 * 2. Summary card with intent icon, order ID chip, resolution status badge, sentiment, 1-3 sentence summary, policy notes, actions taken
 * 3. Metrics row (duration, turns, avg/p50 response latency, tools used) with count-up animation
 * 4. JSON block (syntax colored, Copy JSON with check animation, Download JSON)
 * 5. Full chronological transcript timeline with timestamps and tool events
 * 6. Action buttons: "Start new call", "Download transcript (.txt)", "View History"
 * 7. Animated "Generating summary..." skeleton while waiting
 */

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  XCircle,
  RotateCcw,
  MapPin,
  Banknote,
  Sparkles,
  AlertCircle,
  Compass,
  MessageSquare,
  CheckCircle2,
  Clock,
  Zap,
  Wrench,
  Copy,
  Check,
  Download,
  PhoneCall,
  History,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileText,
  User,
  Bot,
} from "lucide-react";
import {
  fadeUp,
  fadeIn,
  springGentle,
  staggerContainer,
  staggerItem,
  tapScale,
  hoverLift,
} from "@/lib/motion";
import { Badge } from "@/components/ui";

// ── 1. Animated Count-Up Number ──────────────────────────────────────────────
function AnimatedNumber({ value, duration = 900, suffix = "" }) {
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

// ── 2. Format Seconds helper ────────────────────────────────────────────────
function formatSeconds(secs = 0) {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// ── 3. Intent Configuration ─────────────────────────────────────────────────
const INTENT_CONFIG = {
  ORDER_TRACKING: {
    label: "Order Tracking",
    icon: Package,
    color: "text-secondary-light",
    bg: "bg-secondary/15 border-secondary/30",
  },
  CANCELLATION: {
    label: "Cancellation",
    icon: XCircle,
    color: "text-amber-400",
    bg: "bg-amber-500/15 border-amber-500/30",
  },
  RETURN_REFUND: {
    label: "Return & Refund",
    icon: RotateCcw,
    color: "text-rose-400",
    bg: "bg-rose-500/15 border-rose-500/30",
  },
  SHIPPING_INFO: {
    label: "Shipping Info",
    icon: MapPin,
    color: "text-sky-400",
    bg: "bg-sky-500/15 border-sky-500/30",
  },
  COD_INFO: {
    label: "Cash on Delivery",
    icon: Banknote,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15 border-emerald-500/30",
  },
  PRODUCT_INFO: {
    label: "Product Info",
    icon: Sparkles,
    color: "text-primary-light",
    bg: "bg-primary/15 border-primary/30",
  },
  COMPLAINT: {
    label: "Complaint",
    icon: AlertCircle,
    color: "text-orange-400",
    bg: "bg-orange-500/15 border-orange-500/30",
  },
  OUT_OF_SCOPE: {
    label: "Out of Scope",
    icon: Compass,
    color: "text-purple-400",
    bg: "bg-purple-500/15 border-purple-500/30",
  },
  OTHER: {
    label: "General Inquiry",
    icon: MessageSquare,
    color: "text-on-surface-muted",
    bg: "bg-surface-high border-outline-variant/30",
  },
};

// ── 4. Resolution Status Configuration ──────────────────────────────────────
const RESOLUTION_CONFIG = {
  RESOLVED: {
    label: "Resolved",
    variant: "delivered",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  POLICY_DECLINED: {
    label: "Policy Declined",
    variant: "destructive",
    icon: ShieldAlert,
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
  ESCALATION_NEEDED: {
    label: "Escalated",
    variant: "processing",
    icon: AlertCircle,
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  UNRESOLVED: {
    label: "Unresolved",
    variant: "warning",
    icon: Clock,
    badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  ABANDONED: {
    label: "Abandoned",
    variant: "default",
    icon: PhoneCall,
    badgeClass: "bg-surface-high text-on-surface-muted border-outline-variant/30",
  },
};

// ── 5. Customer Sentiment Configuration ─────────────────────────────────────
const SENTIMENT_CONFIG = {
  POSITIVE: {
    label: "Positive",
    emoji: "😊",
    class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  NEUTRAL: {
    label: "Neutral",
    emoji: "😐",
    class: "bg-surface-high text-on-surface-muted border-outline-variant/20",
  },
  NEGATIVE: {
    label: "Negative",
    emoji: "😟",
    class: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
};

// ── 6. Syntax Colored JSON Viewer ───────────────────────────────────────────
function SyntaxHighlightedJson({ data }) {
  const jsonString = useMemo(() => JSON.stringify(data, null, 2), [data]);

  // Colorize tokens: keys, strings, numbers, booleans, nulls
  const highlighted = useMemo(() => {
    if (!jsonString) return "";
    return jsonString.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = "text-amber-300"; // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "text-secondary-light font-medium"; // key
          } else {
            cls = "text-emerald-300"; // string value
          }
        } else if (/true|false/.test(match)) {
          cls = "text-purple-300 font-semibold"; // boolean
        } else if (/null/.test(match)) {
          cls = "text-rose-300 italic"; // null
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }, [jsonString]);

  return (
    <pre
      tabIndex={0}
      className="p-4 rounded-xl font-mono text-xs text-on-surface bg-surface-highest/60 border border-outline-variant/15 overflow-x-auto selection:bg-primary/30 max-h-72 focus:outline-none focus:ring-1 focus:ring-primary/40 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

// ── 7. Main PostCallSummary Component ───────────────────────────────────────
export function PostCallSummary({
  summary,
  loading = false,
  metrics = {},
  transcript = [],
  toolEvents = [],
  onStartNewCall,
  onOpenHistory,
}) {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(true);

  const intent = summary?.customer_intent || "OTHER";
  const intentMeta = INTENT_CONFIG[intent] || INTENT_CONFIG.OTHER;
  const IntentIcon = intentMeta.icon;

  const resolution = summary?.resolution_status || "UNRESOLVED";
  const resolutionMeta = RESOLUTION_CONFIG[resolution] || RESOLUTION_CONFIG.UNRESOLVED;
  const ResolutionIcon = resolutionMeta.icon;

  const sentiment = summary?.customer_sentiment || "NEUTRAL";
  const sentimentMeta = SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.NEUTRAL;

  // Copy JSON handler
  const handleCopyJson = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (e) {
      console.error("Failed to copy JSON:", e);
    }
  };

  // Download JSON handler
  const handleDownloadJson = () => {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-summary-${summary.order_id || "call"}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download Plaintext Transcript handler
  const handleDownloadTranscript = () => {
    if (!transcript || transcript.length === 0) return;
    const lines = [
      "===========================================================",
      "  AURA SKINCARE — ARIA VOICE SUPPORT TRANSCRIPT",
      `  Generated: ${new Date().toLocaleString()}`,
      `  Customer Intent: ${intent}`,
      `  Resolution: ${resolution}`,
      `  Order ID: ${summary?.order_id || "None"}`,
      "===========================================================",
      "",
    ];

    transcript.forEach((t) => {
      const time = t.timestamp ? `[${t.timestamp}] ` : "";
      const speaker = t.speaker === "user" ? "CUSTOMER: " : "ARIA:     ";
      lines.push(`${time}${speaker}${t.text || ""}`);
    });

    if (toolEvents && toolEvents.length > 0) {
      lines.push("");
      lines.push("--- TOOL EXECUTIONS ---");
      toolEvents.forEach((te) => {
        lines.push(
          `• ${te.name}(${JSON.stringify(te.args)}) -> ${JSON.stringify(te.result)}`
        );
      });
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-transcript-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy Order ID
  const handleCopyOrderId = (e) => {
    e.stopPropagation();
    if (!summary?.order_id) return;
    navigator.clipboard.writeText(summary.order_id);
    setCopiedOrderId(true);
    setTimeout(() => setCopiedOrderId(false), 2000);
  };

  // ── Render Skeleton State while generating summary ──
  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto p-6 flex flex-col gap-6 animate-pulse">
        <div className="rounded-3xl p-8 border border-outline-variant/20 bg-surface-container/60 backdrop-blur-xl flex flex-col items-center justify-center text-center py-16">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary-light animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-30" />
          </div>
          <h2 className="font-serif text-xl font-medium text-ivory mb-2">
            Generating Post-Call Summary...
          </h2>
          <p className="text-xs text-on-surface-muted max-w-md mb-8">
            Aria is evaluating customer intent, grounding tool events, and formatting call
            analytics with Gemini.
          </p>
          <div className="w-full max-w-md flex flex-col gap-3">
            <div className="h-4 bg-surface-high rounded-full w-3/4 mx-auto" />
            <div className="h-4 bg-surface-high rounded-full w-full" />
            <div className="h-4 bg-surface-high rounded-full w-5/6 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer(0.08, 0.05)}
      initial="hidden"
      animate="visible"
      className="w-full max-w-4xl mx-auto flex flex-col gap-6 pb-12"
    >
      {/* ── Top Bar: Title & Action Shortcuts ─────────────────────────── */}
      <motion.div
        variants={staggerItem}
        className="flex flex-wrap items-center justify-between gap-4 px-2"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-primary-light bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
              Post-Call Evaluation
            </span>
            <span className="text-xs text-on-surface-muted font-mono">
              Session Completed
            </span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-medium text-ivory tracking-tight">
            Consultation Summary & History
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenHistory && (
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={onOpenHistory}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-on-surface bg-surface-container border border-outline-variant/30 hover:bg-surface-high transition-colors shadow-sm"
              title="View past calls in this session"
            >
              <History className="w-4 h-4 text-secondary-light" />
              <span>Call History</span>
            </motion.button>
          )}

          <motion.button
            whileTap={tapScale}
            whileHover={hoverLift}
            onClick={onStartNewCall}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-canvas bg-primary hover:bg-primary-light text-black transition-all shadow-md shadow-primary/20"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Start New Call</span>
          </motion.button>
        </div>
      </motion.div>

      {/* ── 1. Summary Card ───────────────────────────────────────────── */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-6 sm:p-8 border border-outline-variant/20 bg-surface-container/70 backdrop-blur-xl shadow-2xl relative overflow-hidden"
      >
        {/* Subtle Ambient Glow */}
        <div
          className="absolute -right-20 -top-20 w-64 h-64 rounded-full pointer-events-none opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #f2ca50 0%, transparent 70%)" }}
        />

        {/* Header Tags: Intent, Order ID, Resolution, Sentiment */}
        <div className="flex flex-wrap items-center gap-2.5 mb-5">
          {/* Customer Intent Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${intentMeta.bg}`}
          >
            <IntentIcon className={`w-3.5 h-3.5 ${intentMeta.color}`} />
            <span className={intentMeta.color}>{intentMeta.label}</span>
          </div>

          {/* Order ID Chip (if present) */}
          {summary?.order_id && (
            <button
              onClick={handleCopyOrderId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-semibold bg-surface-highest/80 border border-outline-variant/30 text-ivory hover:border-primary/50 transition-colors group"
              title="Click to copy Order ID"
            >
              <Package className="w-3.5 h-3.5 text-secondary-light" />
              <span>{summary.order_id}</span>
              {copiedOrderId ? (
                <Check className="w-3 h-3 text-emerald-400 ml-0.5" />
              ) : (
                <Copy className="w-3 h-3 text-on-surface-muted group-hover:text-primary-light ml-0.5" />
              )}
            </button>
          )}

          {/* Resolution Status Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${resolutionMeta.badgeClass}`}
          >
            <ResolutionIcon className="w-3.5 h-3.5" />
            <span>{resolutionMeta.label}</span>
          </div>

          {/* Customer Sentiment Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${sentimentMeta.class} ml-auto`}
          >
            <span>{sentimentMeta.emoji}</span>
            <span>{sentimentMeta.label} Sentiment</span>
          </div>
        </div>

        {/* 1-3 Sentence Executive Summary */}
        <div className="mb-6">
          <h3 className="text-xs uppercase font-mono tracking-wider text-on-surface-muted mb-2">
            Call Summary
          </h3>
          <p className="font-serif text-lg sm:text-xl text-ivory leading-relaxed font-normal">
            "{summary?.call_summary || "No call summary generated."}"
          </p>
        </div>

        {/* Policy Notes Callout (if present) */}
        {summary?.policy_notes && (
          <div className="mb-6 rounded-2xl p-4 bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-amber-300 uppercase tracking-wide font-mono mb-1">
                Aura Brand Policy Applied
              </div>
              <p className="text-xs text-on-surface leading-relaxed">
                {summary.policy_notes}
              </p>
            </div>
          </div>
        )}

        {/* Grounded Actions Taken */}
        {summary?.actions_taken && summary.actions_taken.length > 0 && (
          <div>
            <h4 className="text-xs uppercase font-mono tracking-wider text-on-surface-muted mb-2.5">
              Grounded Actions Taken ({summary.actions_taken.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {summary.actions_taken.map((action, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2.5 rounded-xl bg-surface-highest/40 border border-outline-variant/15 text-xs text-on-surface"
                >
                  <CheckCircle2 className="w-4 h-4 text-secondary-light shrink-0 mt-0.5" />
                  <span className="leading-snug">{action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* ── 2. Metrics Row with Count-Up Animation ────────────────────── */}
      <motion.div
        variants={staggerItem}
        className="grid grid-cols-2 sm:grid-cols-5 gap-3"
      >
        {/* Call Duration */}
        <div className="rounded-2xl p-4 bg-surface-container/60 border border-outline-variant/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-muted mb-2">
            <span className="text-xs">Duration</span>
            <Clock className="w-4 h-4 text-primary-light" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-ivory">
            {formatSeconds(metrics.durationSeconds || 0)}
          </div>
          <span className="text-[10px] text-on-surface-muted mt-1 font-mono">
            {metrics.durationSeconds || 0} seconds total
          </span>
        </div>

        {/* Turn Count */}
        <div className="rounded-2xl p-4 bg-surface-container/60 border border-outline-variant/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-muted mb-2">
            <span className="text-xs">Turns</span>
            <MessageSquare className="w-4 h-4 text-secondary-light" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-ivory">
            <AnimatedNumber value={metrics.turns || transcript.length || 0} />
          </div>
          <span className="text-[10px] text-on-surface-muted mt-1">
            conversational exchanges
          </span>
        </div>

        {/* Avg Response Latency */}
        <div className="rounded-2xl p-4 bg-surface-container/60 border border-outline-variant/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-muted mb-2">
            <span className="text-xs">Avg Latency</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-ivory">
            <AnimatedNumber value={metrics.avgLatencyMs || 0} suffix="ms" />
          </div>
          <span className="text-[10px] text-on-surface-muted mt-1">speech-to-speech</span>
        </div>

        {/* p50 Response Latency */}
        <div className="rounded-2xl p-4 bg-surface-container/60 border border-outline-variant/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-muted mb-2">
            <span className="text-xs">p50 Latency</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-ivory">
            <AnimatedNumber value={metrics.p50LatencyMs || 0} suffix="ms" />
          </div>
          <span className="text-[10px] text-on-surface-muted mt-1">median turn delay</span>
        </div>

        {/* Tools Used */}
        <div className="col-span-2 sm:col-span-1 rounded-2xl p-4 bg-surface-container/60 border border-outline-variant/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-muted mb-2">
            <span className="text-xs">Tools Used</span>
            <Wrench className="w-4 h-4 text-purple-400" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-ivory">
            <AnimatedNumber value={toolEvents.length} />
          </div>
          <span className="text-[10px] text-on-surface-muted mt-1">
            database operations
          </span>
        </div>
      </motion.div>

      {/* ── 3. JSON Evaluation Block ──────────────────────────────────── */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-6 border border-outline-variant/20 bg-surface-container/60 backdrop-blur-xl shadow-lg"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-secondary-light" />
            <h3 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
              Structured JSON Schema Output
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Copy JSON */}
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-on-surface bg-surface-highest/80 border border-outline-variant/30 hover:border-primary/50 transition-colors"
            >
              {copiedJson ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-on-surface-muted" />
                  <span>Copy JSON</span>
                </>
              )}
            </motion.button>

            {/* Download JSON */}
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-on-surface bg-surface-highest/80 border border-outline-variant/30 hover:border-primary/50 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-on-surface-muted" />
              <span>Download JSON</span>
            </motion.button>
          </div>
        </div>

        {/* Syntax Colored JSON Component */}
        <SyntaxHighlightedJson data={summary} />
      </motion.div>

      {/* ── 4. Chronological Transcript Timeline ──────────────────────── */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-6 border border-outline-variant/20 bg-surface-container/60 backdrop-blur-xl shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-light" />
            <h3 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
              Call Transcript & Tool Events Timeline
            </h3>
            <span className="text-xs text-on-surface-muted font-mono">
              ({transcript.length} turns)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={handleDownloadTranscript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-on-surface bg-surface-highest/80 border border-outline-variant/30 hover:border-primary/50 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-on-surface-muted" />
              <span>Download transcript (.txt)</span>
            </motion.button>

            <button
              onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
              className="p-1.5 rounded-lg text-on-surface-muted hover:text-ivory hover:bg-surface-highest/60 transition-colors"
              title={isTimelineExpanded ? "Collapse Timeline" : "Expand Timeline"}
            >
              {isTimelineExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isTimelineExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-2 max-h-96 overflow-y-auto pr-1">
                {transcript.map((item, index) => {
                  const isUser = item.speaker === "user";
                  return (
                    <div
                      key={index}
                      className={`flex gap-3 text-xs p-3 rounded-2xl border ${
                        isUser
                          ? "bg-surface-highest/30 border-outline-variant/10 ml-6"
                          : "bg-primary/5 border-primary/15 mr-6"
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isUser
                            ? "bg-surface-high text-on-surface-muted"
                            : "bg-primary/20 text-primary-light"
                        }`}
                      >
                        {isUser ? (
                          <User className="w-3.5 h-3.5" />
                        ) : (
                          <Bot className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`font-semibold ${
                              isUser ? "text-ivory" : "text-primary-light"
                            }`}
                          >
                            {isUser ? "Customer" : "Aria"}
                          </span>
                          {item.timestamp && (
                            <span className="font-mono text-[10px] text-on-surface-muted">
                              {item.timestamp}
                            </span>
                          )}
                        </div>
                        <p className="text-on-surface leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Inline Tool Events summary if any */}
                {toolEvents.length > 0 && (
                  <div className="pt-3 border-t border-outline-variant/15 mt-4">
                    <div className="text-[11px] font-mono text-on-surface-muted uppercase mb-2">
                      Tools Invoked During Call:
                    </div>
                    <div className="space-y-1.5">
                      {toolEvents.map((te, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-highest/40 font-mono text-xs text-on-surface border border-outline-variant/15"
                        >
                          <div className="flex items-center gap-2">
                            <Wrench className="w-3.5 h-3.5 text-secondary-light" />
                            <span className="text-ivory font-medium">{te.name}</span>
                            <span className="text-on-surface-muted text-[11px]">
                              {JSON.stringify(te.args)}
                            </span>
                          </div>
                          {te.durationMs && (
                            <span className="text-[10px] text-on-surface-muted">
                              {te.durationMs}ms
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
