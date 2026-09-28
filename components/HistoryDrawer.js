"use client";

/**
 * components/HistoryDrawer.js — Session Call History Slide-Over Drawer
 *
 * Requirements:
 * 1. Fetch this session's previous calls from /api/calls?sessionId=...
 * 2. List calls with duration, mode, intent, resolution, order ID, and summary snippet
 * 3. Open any call to view its summary again
 * 4. Smooth slide-over animation with backdrop and keyboard escape support
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  History,
  PhoneCall,
  Clock,
  Package,
  Calendar,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Bot,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import {
  slideRight,
  fadeIn,
  springGentle,
  staggerContainer,
  staggerItem,
  tapScale,
} from "@/lib/motion";
import { Badge } from "@/components/ui";

function formatCallTime(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatCallDate(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function HistoryDrawer({
  isOpen,
  onClose,
  sessionId = "default-session",
  onSelectCall,
}) {
  const [sessionCalls, setSessionCalls] = useState([]);
  const [allCalls, setAllCalls] = useState([]);
  const [scope, setScope] = useState("session"); // "session" | "all"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCalls = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.ok) {
        const sCalls = Array.isArray(data.sessionCalls) ? data.sessionCalls : [];
        const aCalls = Array.isArray(data.allCalls)
          ? data.allCalls
          : Array.isArray(data.calls)
          ? data.calls
          : [];

        setSessionCalls(sCalls);
        setAllCalls(aCalls);

        // If current session has no calls yet, but other recorded calls exist, default to "all"
        if (sCalls.length === 0 && aCalls.length > 0) {
          setScope("all");
        }
      } else {
        setSessionCalls([]);
        setAllCalls([]);
      }
    } catch (err) {
      console.error("[HistoryDrawer] Failed to fetch calls:", err);
      setError(err?.message || "Failed to load call history");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen) {
      fetchCalls();
    }
  }, [isOpen, fetchCalls]);

  // Escape key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const displayedCalls = scope === "session" ? sessionCalls : allCalls;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
            aria-hidden="true"
          />

          {/* Drawer Container */}
          <motion.div
            variants={slideRight}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-surface-container/95 backdrop-blur-2xl border-l border-outline-variant/20 z-50 flex flex-col shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-drawer-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/15 bg-surface/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center">
                  <History className="w-4 h-4 text-secondary-light" />
                </div>
                <div>
                  <h3
                    id="history-drawer-title"
                    className="font-serif text-lg font-medium text-ivory tracking-tight"
                  >
                    Call History
                  </h3>
                  <p className="text-[11px] text-on-surface-muted font-mono truncate max-w-[240px]">
                    Session: {sessionId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchCalls}
                  disabled={loading}
                  className="p-2 rounded-xl text-on-surface-muted hover:text-ivory hover:bg-surface-high transition-colors"
                  title="Refresh calls"
                  aria-label="Refresh calls"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl text-on-surface-muted hover:text-ivory hover:bg-surface-high transition-colors"
                  title="Close history drawer"
                  aria-label="Close history drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scope Toggle: This Session vs All Calls */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center p-1 bg-surface-highest/60 rounded-xl border border-outline-variant/20">
                <button
                  onClick={() => setScope("session")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                    scope === "session"
                      ? "bg-surface-container text-ivory shadow-sm border border-outline-variant/30"
                      : "text-on-surface-muted hover:text-on-surface"
                  }`}
                >
                  This Session ({sessionCalls.length})
                </button>
                <button
                  onClick={() => setScope("all")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                    scope === "all"
                      ? "bg-surface-container text-ivory shadow-sm border border-outline-variant/30"
                      : "text-on-surface-muted hover:text-on-surface"
                  }`}
                >
                  All Calls ({allCalls.length})
                </button>
              </div>
            </div>

            {/* Calls List Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && displayedCalls.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6 space-y-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-surface-high" />
                  <div className="h-4 bg-surface-high rounded-full w-48" />
                  <div className="h-3 bg-surface-high rounded-full w-32" />
                </div>
              ) : error ? (
                <div className="rounded-2xl p-6 bg-rose-500/10 border border-rose-500/20 text-center space-y-2">
                  <p className="text-xs text-rose-300">{error}</p>
                  <button
                    onClick={fetchCalls}
                    className="text-xs text-primary-light underline"
                  >
                    Try Again
                  </button>
                </div>
              ) : displayedCalls.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-80 text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-surface-high border border-outline-variant/20 flex items-center justify-center text-on-surface-muted">
                    <PhoneCall className="w-6 h-6 opacity-40" />
                  </div>
                  <h4 className="font-serif text-base font-medium text-ivory">
                    {scope === "session"
                      ? "No Calls in Current Session"
                      : "No Recorded Calls Yet"}
                  </h4>
                  <p className="text-xs text-on-surface-muted max-w-xs leading-relaxed">
                    {scope === "session" && allCalls.length > 0
                      ? `There are ${allCalls.length} calls from previous sessions available to view.`
                      : "Once you finish a consultation with Aria, the evaluated summary and tool events will appear here."}
                  </p>
                  {scope === "session" && allCalls.length > 0 && (
                    <button
                      onClick={() => setScope("all")}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-surface-highest text-primary-light text-xs font-medium border border-outline-variant/30 hover:border-primary/50 transition-colors"
                    >
                      View All Recorded Calls ({allCalls.length})
                    </button>
                  )}
                </div>
              ) : (
                <motion.div
                  variants={staggerContainer(0.05, 0.02)}
                  initial="hidden"
                  animate="visible"
                  className="space-y-3"
                >
                  {displayedCalls.map((c, index) => {
                    const sum = c.summary || {};
                    const intent = sum.customer_intent || "OTHER";
                    const resolution = sum.resolution_status || "UNRESOLVED";
                    const durationSec = c.duration_s || 0;
                    const isCurrentSession = c.session_id === sessionId;

                    return (
                      <motion.div
                        key={c.id || index}
                        variants={staggerItem}
                        whileHover={{ scale: 1.01 }}
                        whileTap={tapScale}
                        onClick={() => {
                          onSelectCall?.(c);
                          onClose();
                        }}
                        className="rounded-2xl p-4 bg-surface-container/70 border border-outline-variant/15 hover:border-primary/40 hover:bg-surface-highest/60 transition-all cursor-pointer group shadow-sm flex flex-col gap-2.5"
                      >
                        {/* Top info line: Date, Time, Duration, Mode */}
                        <div className="flex items-center justify-between text-[11px] text-on-surface-muted font-mono">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {formatCallDate(c.started_at)} • {formatCallTime(c.started_at)}
                            </span>
                            {isCurrentSession && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/15 text-primary-light border border-primary/30 font-sans">
                                Current
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface-highest border border-outline-variant/20 uppercase">
                              {c.mode || "realtime"}
                            </span>
                            <span>{durationSec}s</span>
                          </div>
                        </div>

                        {/* Middle line: Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-primary/10 border border-primary/20 text-primary-light">
                            {intent}
                          </span>

                          {sum.order_id && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-surface-highest border border-outline-variant/25 text-ivory">
                              {sum.order_id}
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              resolution === "RESOLVED"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : resolution === "POLICY_DECLINED"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : resolution === "ESCALATION_NEEDED"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : resolution === "ABANDONED"
                                ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                : "bg-surface-highest text-on-surface-muted border-outline-variant/20"
                            }`}
                          >
                            {resolution}
                          </span>

                          <ChevronRight className="w-4 h-4 text-on-surface-muted group-hover:text-primary-light ml-auto transition-transform group-hover:translate-x-0.5" />
                        </div>

                        {/* Call Summary snippet */}
                        <p className="text-xs text-on-surface-muted line-clamp-2 leading-relaxed group-hover:text-on-surface transition-colors">
                          {sum.call_summary || "Call concluded without detailed notes."}
                        </p>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-outline-variant/15 bg-surface/30 flex items-center justify-between text-xs text-on-surface-muted font-mono">
              <span>
                {displayedCalls.length} call{displayedCalls.length === 1 ? "" : "s"} (
                {scope === "session" ? "current session" : "all sessions"})
              </span>
              <button
                onClick={onClose}
                className="text-primary-light hover:underline text-xs"
              >
                Close Drawer
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
