"use client";

/**
 * components/LiveTranscript.js — Animated Streaming Chat & Inline Tool Chips
 *
 * Requirements:
 * - Animated chat bubbles (Customer right, Agent left)
 * - Streams text as fragments arrive
 * - Auto-scroll with smart user-scroll detection (stops if user scrolls up)
 * - "Jump to latest" floating pill when scrolled up
 * - Timestamps revealed on hover
 * - Inline Tool Event chips ("Looked up ORD-101", "Cancellation requested", "Ticket created")
 *   with subtle pulse while running, check/x icon when done
 * - Typed message input option
 * - Performance: memoized individual transcript row components
 */

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  User,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
} from "lucide-react";
import { springGentle } from "@/lib/motion";

function formatToolTitle(event) {
  const name = event?.name;
  const args = event?.args || {};
  const orderId = args.orderId || args.order_id || "";

  switch (name) {
    case "getOrderDetails":
      return orderId ? `Looked up ${orderId}` : "Looked up order details";
    case "requestCancellation":
      return orderId ? `Cancellation requested for ${orderId}` : "Cancellation requested";
    case "createSupportTicket":
      return "Support ticket created";
    default:
      return `${name}() executed`;
  }
}

// Memoized individual transcript row for performance during token streaming
const TranscriptRow = memo(function TranscriptRow({ turn, matchingTool }) {
  const isUser = turn.speaker === "user";

  return (
    <div className="flex flex-col gap-2">
      {/* Chat bubble row */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springGentle}
        className={`flex items-start gap-2.5 group ${isUser ? "justify-end" : "justify-start"}`}
      >
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-primary-light" />
          </div>
        )}

        <div className="flex flex-col max-w-[85%] sm:max-w-[75%]">
          {/* Bubble */}
          <div
            className={`p-3.5 rounded-2xl shadow-sm transition-all relative ${
              isUser
                ? "bg-secondary-container/20 text-ivory border border-secondary/30 rounded-tr-sm ml-auto"
                : "bg-surface-high/80 text-ivory border border-outline-variant/20 rounded-tl-sm"
            }`}
          >
            <p className="leading-relaxed whitespace-pre-wrap break-words text-[13px] sm:text-[14px]">
              {turn.text}
              {!turn.isComplete && !isUser && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-primary animate-pulse" />
              )}
            </p>

            {/* Interrupted Flag */}
            {turn.isInterrupted && (
              <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger/20 border border-danger/30 text-[10px] text-danger font-medium">
                Interrupted
              </div>
            )}
          </div>

          {/* Timestamp on hover */}
          <div
            className={`text-[10px] text-on-surface-muted mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity font-mono ${
              isUser ? "text-right" : "text-left"
            }`}
          >
            {turn.timestamp || "Just now"}
          </div>
        </div>

        {isUser && (
          <div className="w-7 h-7 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <User className="w-3.5 h-3.5 text-secondary-light" />
          </div>
        )}
      </motion.div>

      {/* Inline Tool Event Chip if present */}
      {matchingTool && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="self-center my-1"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-high/90 border border-outline-variant/30 text-xs font-mono shadow-sm">
            {matchingTool.result?.error ? (
              <AlertCircle className="w-3.5 h-3.5 text-danger" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-secondary-light" />
            )}
            <span className="text-ivory font-medium">
              {formatToolTitle(matchingTool)}
            </span>
            <span className="text-[10px] text-on-surface-muted border-l border-outline-variant/20 pl-2">
              {matchingTool.durationMs}ms
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
});

function LiveTranscriptComponent({
  transcript = [],
  toolEvents = [],
  state = "idle",
  onSendTypedMessage = null,
  className = "",
}) {
  const containerRef = useRef(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [typedText, setTypedText] = useState("");

  // Auto-scroll handler
  const scrollToBottom = useCallback((smooth = true) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      setIsScrolledUp(false);
    }
  }, []);

  // Monitor user scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user scrolled up more than 70px from bottom
    setIsScrolledUp(distanceToBottom > 70);
  }, []);

  // Auto-scroll on transcript update if user is already at bottom
  useEffect(() => {
    if (!isScrolledUp) {
      scrollToBottom(true);
    }
  }, [transcript, toolEvents, isScrolledUp, scrollToBottom]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!typedText.trim()) return;
    onSendTypedMessage?.(typedText.trim());
    setTypedText("");
  };

  return (
    <div className={`relative flex flex-col h-full bg-surface-container/50 border border-outline-variant/15 rounded-3xl overflow-hidden backdrop-blur-md ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/10 bg-surface-high/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary-light" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ivory">
            Live Consultation Transcript
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {toolEvents.length > 0 && (
            <span className="text-[10px] font-mono text-secondary-light bg-secondary/10 px-2 py-0.5 rounded-full border border-secondary/20">
              {toolEvents.length} action{toolEvents.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[11px] text-on-surface-muted">
            {transcript.length} turn{transcript.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Transcript Scroll Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 font-sans text-sm relative scroll-smooth"
        role="log"
        aria-live="polite"
        aria-label="Conversation Transcript"
      >
        {transcript.length === 0 && toolEvents.length === 0 ? (
          // Ethereal Empty State
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-on-surface-muted gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-high/60 flex items-center justify-center text-primary/70">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-ivory">No conversation yet</p>
              <p className="text-xs text-on-surface-muted mt-1 max-w-xs">
                Start the voice call or type below to consult with Aria about orders, returns, and skincare.
              </p>
            </div>
          </div>
        ) : (
          <>
            {transcript.map((turn, idx) => (
              <TranscriptRow
                key={turn.id || `turn-${idx}`}
                turn={turn}
                matchingTool={toolEvents[idx]}
              />
            ))}

            {/* In-flight Tool Pulse Chip if agent is thinking & has active tool */}
            {state === "thinking" && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="self-center my-1"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-xs font-mono text-primary-light animate-pulse shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking Aura database...</span>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Floating "Jump to latest" pill */}
      <AnimatePresence>
        {isScrolledUp && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-16 self-center z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-elevated/95 border border-primary/30 text-xs text-ivory font-medium shadow-xl hover:border-primary focus:outline-none"
            aria-label="Jump to latest message"
          >
            <span>Jump to latest</span>
            <ArrowDown className="w-3.5 h-3.5 text-primary" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Typed Input Form Footer */}
      {onSendTypedMessage && (
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-outline-variant/15 bg-surface-high/40 flex items-center gap-2"
        >
          <input
            type="text"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder="Type your question or query..."
            className="flex-1 bg-surface-container/70 border border-outline-variant/25 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-ivory placeholder:text-on-surface-muted focus:outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={!typedText.trim()}
            className="p-2.5 rounded-xl bg-primary text-canvas disabled:opacity-40 hover:bg-primary-light transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
            aria-label="Send message"
          >
            <Send className="w-4 h-4 text-black" />
          </button>
        </form>
      )}
    </div>
  );
}

export const LiveTranscript = memo(LiveTranscriptComponent);
