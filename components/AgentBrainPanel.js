"use client";

/**
 * components/AgentBrainPanel.js — "Agent Brain" Live Reasoning Panel
 *
 * Glass-box view into the agent's real-time cognitive process:
 * 1. Detected Intent (fast rule-based classifier with confidence score)
 * 2. Real-time Turn Latency Metrics
 * 3. Decision Timeline (TOOL_CALL, POLICY_VERDICT, GUARDRAIL, FALLBACK)
 * 4. Machine-readable ruleCited badges & human-readable explanations
 * 5. Collapsible JSON payload viewer
 * 6. Subtle glow on newest events + auto-scroll + Clear button
 * 7. Framer Motion transitions with reduced-motion support
 * 8. Responsive: side drawer on desktop, mobile tab / sheet, down to 360px
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Brain,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Package,
  RotateCcw,
  Sparkles,
  Zap,
  Filter,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { DECISION_KINDS } from "@/lib/decision-events";

/**
 * Helper to get styling by event kind & status
 */
function getEventTheme(event) {
  if (event.kind === DECISION_KINDS.POLICY_VERDICT) {
    if (event.status === "allowed") {
      return {
        border: "border-emerald-500/40",
        bg: "bg-emerald-500/10",
        glow: "shadow-[0_0_15px_rgba(16,185,129,0.2)]",
        badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        icon: CheckCircle2,
        iconColor: "text-emerald-400",
      };
    }
    return {
      border: "border-rose-500/40",
      bg: "bg-rose-500/10",
      glow: "shadow-[0_0_15px_rgba(244,63,94,0.2)]",
      badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
      icon: XCircle,
      iconColor: "text-rose-400",
    };
  }

  if (event.kind === DECISION_KINDS.GUARDRAIL) {
    return {
      border: "border-amber-500/40",
      bg: "bg-amber-500/10",
      glow: "shadow-[0_0_15px_rgba(245,158,11,0.2)]",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      icon: ShieldAlert,
      iconColor: "text-amber-400",
    };
  }

  if (event.kind === DECISION_KINDS.FALLBACK) {
    return {
      border: "border-secondary/40",
      bg: "bg-secondary/10",
      glow: "shadow-[0_0_15px_rgba(78,222,163,0.2)]",
      badgeBg: "bg-secondary/20 text-secondary-light border-secondary/30",
      icon: Zap,
      iconColor: "text-secondary-light",
    };
  }

  // TOOL_CALL
  const isErr = event.status === "error";
  return {
    border: isErr ? "border-rose-500/40" : "border-primary/40",
    bg: isErr ? "bg-rose-500/10" : "bg-primary/10",
    glow: isErr
      ? "shadow-[0_0_15px_rgba(244,63,94,0.2)]"
      : "shadow-[0_0_15px_rgba(230,175,46,0.2)]",
    badgeBg: isErr
      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
      : "bg-primary/20 text-primary-light border-primary/30",
    icon: isErr ? AlertTriangle : Terminal,
    iconColor: isErr ? "text-rose-400" : "text-primary",
  };
}

/**
 * Individual Decision Event Card
 */
function DecisionCard({ event, isNewest, reducedMotion }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const theme = getEventTheme(event);
  const Icon = theme.icon;

  const hasJsonData =
    event.detail &&
    typeof event.detail === "object" &&
    Object.keys(event.detail).length > 0;

  return (
    <motion.div
      layout={!reducedMotion}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative rounded-2xl p-3.5 border transition-all duration-300 backdrop-blur-md ${
        theme.bg
      } ${theme.border} ${isNewest ? theme.glow + " ring-1 ring-primary/40" : ""}`}
    >
      {/* Newest event pulse badge */}
      {isNewest && (
        <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase font-semibold bg-primary text-black shadow-sm flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
          Latest
        </span>
      )}

      {/* Header: Kind, Title, Time */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wide uppercase border ${theme.badgeBg}`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {event.kind?.replace("_", " ")}
          </span>
          <span className="text-xs font-semibold text-ivory tracking-tight">
            {event.title}
          </span>
        </div>

        <span className="text-[10px] font-mono text-on-surface-muted shrink-0 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {event.timestamp}
        </span>
      </div>

      {/* Machine-readable Rule Cited (if present) */}
      {event.ruleCited && (
        <div className="my-1.5 p-1.5 rounded-lg bg-black/40 border border-white/10 flex items-start gap-1.5">
          <span className="text-[10px] uppercase font-mono font-bold text-accent shrink-0 pt-0.5">
            Rule:
          </span>
          <code className="text-[11px] font-mono text-ivory/90 break-all leading-tight">
            {event.ruleCited}
          </code>
        </div>
      )}

      {/* Readable Detail / Reason */}
      {event.detail && (
        <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
          {typeof event.detail === "string"
            ? event.detail
            : event.detail?.resultSummary || "Tool execution completed."}
        </p>
      )}

      {/* Tool duration badge */}
      {event.durationMs !== undefined && event.durationMs > 0 && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-muted">
          <span className="inline-flex items-center gap-1 font-mono">
            <Zap className="w-3 h-3 text-primary" />
            Execution: {event.durationMs}ms
          </span>

          {hasJsonData && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] text-primary hover:text-primary-light flex items-center gap-1 font-medium transition-colors"
            >
              <span>{isExpanded ? "Hide Payload" : "View Payload"}</span>
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Collapsible Raw JSON Data */}
      <AnimatePresence>
        {isExpanded && hasJsonData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 pt-2 border-t border-white/10 overflow-hidden"
          >
            <pre className="text-[10px] font-mono text-emerald-300/90 bg-black/60 p-2.5 rounded-xl overflow-x-auto max-h-48 scrollbar-thin border border-white/5">
              {JSON.stringify(event.detail, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Main Agent Brain Panel Component
 */
export function AgentBrainPanel({
  isOpen = false,
  onClose,
  events = [],
  detectedIntent = null,
  latency = null,
  onClear,
  isMobileTab = false,
}) {
  const reducedMotion = useReducedMotion();
  const [filter, setFilter] = useState("ALL");
  const bottomRef = useRef(null);

  // Auto-scroll to latest event as new events arrive
  useEffect(() => {
    if (events.length > 0 && bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    }
  }, [events.length, reducedMotion]);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (filter === "ALL") return events;
    return events.filter((e) => e.kind === filter);
  }, [events, filter]);

  const newestEventId = events.length > 0 ? events[events.length - 1].id : null;

  // Counts by kind
  const counts = useMemo(() => {
    const res = { ALL: events.length, TOOL_CALL: 0, POLICY_VERDICT: 0, GUARDRAIL: 0 };
    for (const e of events) {
      if (res[e.kind] !== undefined) res[e.kind]++;
    }
    return res;
  }, [events]);

  const content = (
    <div className="flex flex-col h-full w-full bg-surface-container-high/90 sm:backdrop-blur-2xl text-on-surface select-none">
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between gap-3 shrink-0 bg-surface/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm">
            <Brain className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ivory font-serif tracking-tight">
                Agent Brain
              </h2>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <p className="text-[11px] text-on-surface-muted font-sans">
              Glass-box reasoning & policy engine audit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {events.length > 0 && onClear && (
            <button
              onClick={onClear}
              title="Clear reasoning history"
              className="p-1.5 rounded-lg text-on-surface-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onClose && !isMobileTab && (
            <button
              onClick={onClose}
              title="Close panel"
              className="p-1.5 rounded-lg text-on-surface-muted hover:text-ivory hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Section: Cognitive Intent & Latency Metrics ─────── */}
      <div className="p-4 border-b border-outline-variant/20 flex flex-col gap-3 shrink-0 bg-black/20">
        {/* Detected Intent Card */}
        <div className="rounded-2xl p-3 bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
              {detectedIntent?.intent === "ORDER_TRACKING" && <Package className="w-4 h-4" />}
              {detectedIntent?.intent === "CANCELLATION" && <XCircle className="w-4 h-4" />}
              {detectedIntent?.intent === "RETURN_REFUND" && <RotateCcw className="w-4 h-4" />}
              {detectedIntent?.intent === "COMPLAINT" && <AlertTriangle className="w-4 h-4" />}
              {detectedIntent?.intent === "PRODUCT_INFO" && <Sparkles className="w-4 h-4" />}
              {detectedIntent?.intent === "OUT_OF_SCOPE" && <ShieldAlert className="w-4 h-4" />}
              {(!detectedIntent ||
                !["ORDER_TRACKING", "CANCELLATION", "RETURN_REFUND", "COMPLAINT", "PRODUCT_INFO", "OUT_OF_SCOPE"].includes(
                  detectedIntent.intent
                )) && <Activity className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono tracking-wider text-on-surface-muted">
                Detected Intent
              </div>
              <div className="text-xs font-bold text-ivory flex items-center gap-1.5">
                <span>{detectedIntent?.label || "Listening for query..."}</span>
                {detectedIntent?.confidence && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-emerald-300">
                    {Math.round(detectedIntent.confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Turn Latency Chip */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 flex items-center gap-1.5 text-[11px] font-mono text-ivory">
              <Zap className="w-3 h-3 text-primary animate-pulse" />
              <span>
                {latency?.current ? `${latency.current}ms` : "Live"}
              </span>
              {latency?.p50 > 0 && (
                <span className="text-[10px] text-on-surface-muted border-l border-white/10 pl-1.5">
                  p50: {latency.p50}ms
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Intent Context Reason (if present) */}
        {detectedIntent?.reason && (
          <p className="text-[11px] text-on-surface-muted italic font-sans flex items-center gap-1.5 px-1">
            <ArrowRight className="w-3 h-3 text-primary shrink-0" />
            <span>{detectedIntent.reason}</span>
          </p>
        )}

        {/* ── Category Filter Tabs ─────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px] font-mono">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-2.5 py-1 rounded-lg border transition-all shrink-0 ${
              filter === "ALL"
                ? "bg-primary text-black font-bold border-primary shadow-sm"
                : "bg-surface-container/60 text-on-surface-muted border-white/5 hover:border-white/20"
            }`}
          >
            All ({counts.ALL})
          </button>
          <button
            onClick={() => setFilter(DECISION_KINDS.POLICY_VERDICT)}
            className={`px-2.5 py-1 rounded-lg border transition-all shrink-0 ${
              filter === DECISION_KINDS.POLICY_VERDICT
                ? "bg-emerald-500 text-black font-bold border-emerald-500 shadow-sm"
                : "bg-surface-container/60 text-on-surface-muted border-white/5 hover:border-white/20"
            }`}
          >
            Policy ({counts.POLICY_VERDICT})
          </button>
          <button
            onClick={() => setFilter(DECISION_KINDS.TOOL_CALL)}
            className={`px-2.5 py-1 rounded-lg border transition-all shrink-0 ${
              filter === DECISION_KINDS.TOOL_CALL
                ? "bg-primary-light text-black font-bold border-primary-light shadow-sm"
                : "bg-surface-container/60 text-on-surface-muted border-white/5 hover:border-white/20"
            }`}
          >
            Tools ({counts.TOOL_CALL})
          </button>
          <button
            onClick={() => setFilter(DECISION_KINDS.GUARDRAIL)}
            className={`px-2.5 py-1 rounded-lg border transition-all shrink-0 ${
              filter === DECISION_KINDS.GUARDRAIL
                ? "bg-amber-500 text-black font-bold border-amber-500 shadow-sm"
                : "bg-surface-container/60 text-on-surface-muted border-white/5 hover:border-white/20"
            }`}
          >
            Guardrails ({counts.GUARDRAIL})
          </button>
        </div>
      </div>

      {/* ── Event Stream Timeline ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-on-surface-muted space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-on-surface-muted">
              <Layers className="w-6 h-6 opacity-40" />
            </div>
            <p className="text-xs font-semibold text-ivory/80">
              No Reasoning Events Yet
            </p>
            <p className="text-[11px] max-w-xs leading-relaxed font-sans text-on-surface-muted">
              Start speaking with Aria or try one of the test orders. Real-time tool execution, policy rules cited, and guardrails will stream here live.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredEvents.map((evt) => (
              <DecisionCard
                key={evt.id}
                event={evt}
                isNewest={evt.id === newestEventId}
                reducedMotion={reducedMotion}
              />
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* ── Footer Stats ────────────────────────────────────── */}
      <div className="p-3 border-t border-outline-variant/20 bg-surface/50 text-[10px] font-mono text-on-surface-muted flex items-center justify-between shrink-0">
        <span>Aura Policy Engine v2.4</span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>3-Layer Guardrails Active</span>
        </span>
      </div>
    </div>
  );

  // If used as a mobile tab inside another container, render directly
  if (isMobileTab) {
    return <div className="w-full h-full min-h-[500px] flex flex-col rounded-3xl overflow-hidden border border-outline-variant/30 shadow-2xl">{content}</div>;
  }

  // Otherwise, render as a slide-over drawer for desktop
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop on small screens */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />

          {/* Desktop Drawer (slid from right) */}
          <motion.aside
            initial={reducedMotion ? { opacity: 0 } : { x: "100%", opacity: 0.8 }}
            animate={reducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] lg:w-[450px] z-50 shadow-2xl border-l border-outline-variant/30 overflow-hidden"
          >
            {content}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
