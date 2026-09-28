"use client";

/**
 * components/CallControls.js — Call Actions, Morphing Button & Telemetry
 *
 * Requirements:
 * - Large round Start Call button that morphs (layout animation) into End Call with timer
 * - Disabled / loading states (connecting)
 * - Keyboard shortcut Space to start/end (announced via aria)
 * - Mute toggle
 * - Mode badge (Realtime / Backup) with tooltip
 * - Live latency badge (last response time / p50)
 */

import { useState, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Loader2,
  Clock,
  Zap,
  Sparkles,
} from "lucide-react";
import { Tooltip, Badge } from "@/components/ui";
import { springSnap, springGentle } from "@/lib/motion";

function CallControlsComponent({
  state = "idle",
  mode = "realtime",
  isMuted = false,
  latency = null,
  onStart,
  onEnd,
  onMute,
  onSwitchMode,
  className = "",
}) {
  const isInCall =
    state === "listening" || state === "thinking" || state === "speaking";
  const isConnecting = state === "connecting";

  // Active call duration timer
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isInCall) {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCallDuration(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isInCall]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Keyboard shortcut: Space to toggle call, M to toggle mute
  const [ariaAnnouncement, setAriaAnnouncement] = useState("");

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input, textarea, or contentEditable
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (isInCall) {
          setAriaAnnouncement("Ending call via Spacebar shortcut");
          onEnd?.();
        } else if (!isConnecting) {
          setAriaAnnouncement("Starting call via Spacebar shortcut");
          onStart?.();
        }
      } else if (e.code === "KeyM" && isInCall) {
        e.preventDefault();
        onMute?.();
        setAriaAnnouncement(isMuted ? "Microphone unmuted" : "Microphone muted");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isInCall, isConnecting, isMuted, onStart, onEnd, onMute]);

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Invisible screen reader announcer */}
      <div className="sr-only" aria-live="assertive">
        {ariaAnnouncement}
      </div>

      {/* Main Action Bar */}
      <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
        {/* Mode Selector Badge with Tooltip */}
        <Tooltip
          content={
            mode === "realtime"
              ? "Primary Gemini Live native audio. Click to switch to Groq backup mode."
              : "Backup Groq Llama + Web Speech mode. Click to switch to Gemini Live."
          }
        >
          <button
            onClick={() => onSwitchMode?.(mode === "realtime" ? "classic" : "realtime")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-high/60 border border-outline-variant/20 hover:border-primary/40 text-[11px] font-mono transition-colors text-on-surface"
            aria-label={`Current voice mode: ${mode === "realtime" ? "Gemini Live" : "Backup Mode"}. Click to toggle.`}
          >
            <Sparkles className="w-3 h-3 text-primary-light" />
            <span className="text-on-surface-muted">Mode:</span>
            <strong className="text-ivory font-semibold">
              {mode === "realtime" ? "Gemini Live" : "Backup"}
            </strong>
          </button>
        </Tooltip>

        {/* Central Morphing Call Button */}
        <div className="relative flex items-center justify-center">
          <AnimatePresence mode="wait">
            {!isInCall && !isConnecting ? (
              // --- START CALL BUTTON ---
              <motion.button
                key="start-btn"
                layoutId="call-action-btn"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={springGentle}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onStart}
                className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center text-canvas font-semibold shadow-lg group focus:outline-none focus:ring-4 focus:ring-primary/40"
                style={{
                  background: "linear-gradient(135deg, #f2ca50 0%, #d4af37 100%)",
                  boxShadow: "0 0 35px rgba(212, 175, 55, 0.45)",
                }}
                aria-label="Start voice call with Aria (Shortcut: Space)"
              >
                <Phone className="w-7 h-7 sm:w-8 sm:h-8 text-black transition-transform group-hover:scale-110" />
                <span className="sr-only">Start Call</span>
              </motion.button>
            ) : isConnecting ? (
              // --- CONNECTING / LOADING STATE ---
              <motion.button
                key="connecting-btn"
                layoutId="call-action-btn"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={springGentle}
                disabled
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center bg-surface-high border border-primary/40 text-primary cursor-not-allowed opacity-90 shadow-md"
                aria-label="Connecting voice call..."
              >
                <Loader2 className="w-8 h-8 animate-spin" />
              </motion.button>
            ) : (
              // --- END CALL BUTTON (MORPHED) ---
              <motion.button
                key="end-btn"
                layoutId="call-action-btn"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={springGentle}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onEnd}
                className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center text-ivory font-semibold shadow-lg group focus:outline-none focus:ring-4 focus:ring-danger/40"
                style={{
                  background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                  boxShadow: "0 0 30px rgba(239, 68, 68, 0.4)",
                }}
                aria-label="End active voice call (Shortcut: Space)"
              >
                <PhoneOff className="w-7 h-7 sm:w-8 sm:h-8 transition-transform group-hover:scale-110" />
                <span className="sr-only">End Call</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Mute Toggle (visible when in-call or connecting) */}
        {isInCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={springSnap}
          >
            <Tooltip content={isMuted ? "Unmute mic (M)" : "Mute mic (M)"}>
              <button
                onClick={onMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
                  isMuted
                    ? "bg-danger/20 text-danger border-danger/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    : "bg-surface-high/80 text-primary border-outline-variant/30 hover:border-primary/50"
                } focus:outline-none focus:ring-2 focus:ring-primary/40`}
                aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? (
                  <MicOff className="w-5 h-5 text-danger" />
                ) : (
                  <Mic className="w-5 h-5 text-primary" />
                )}
              </button>
            </Tooltip>
          </motion.div>
        )}

        {/* Active Call Duration Timer */}
        {isInCall && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-high/60 border border-outline-variant/20 font-mono text-xs text-ivory"
            role="timer"
            aria-label={`Call elapsed time: ${formatTimer(callDuration)}`}
          >
            <Clock className="w-3.5 h-3.5 text-secondary-light animate-pulse" />
            <span>{formatTimer(callDuration)}</span>
          </motion.div>
        )}

        {/* Live Latency Telemetry */}
        {latency?.current !== null && latency?.current !== undefined && (
          <Tooltip content={`Turn Latency: ${latency.current} ms (Median p50: ${latency.p50 || latency.current} ms)`}>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-high/50 border border-outline-variant/15 text-[11px] font-mono text-on-surface-muted">
              <Zap className="w-3 h-3 text-secondary-light" />
              <span>{latency.current}ms</span>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Helpful keyboard shortcut hint */}
      <p className="text-[11px] text-on-surface-muted font-sans select-none">
        Press <kbd className="px-1.5 py-0.5 rounded bg-surface-high border border-outline-variant/20 font-mono text-[10px] text-ivory">Space</kbd> to {isInCall ? "end call" : "talk"}
        {isInCall && (
          <>
            {" "}· <kbd className="px-1.5 py-0.5 rounded bg-surface-high border border-outline-variant/20 font-mono text-[10px] text-ivory">M</kbd> to mute
          </>
        )}
      </p>
    </div>
  );
}

export const CallControls = memo(CallControlsComponent);
