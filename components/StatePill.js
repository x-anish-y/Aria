"use client";

/**
 * components/StatePill.js — Animated Voice State Pill
 *
 * Requirements:
 * - Animated Listening / Thinking / Speaking / Connecting / Idle / Ended / Error
 * - Distinct Semantic Icon + Label (not color alone for accessibility)
 * - Crossfaded with Framer Motion AnimatePresence mode="wait"
 */

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Volume2,
  Sparkles,
  Loader2,
  PhoneOff,
  AlertCircle,
  Radio,
} from "lucide-react";
import { springGentle } from "@/lib/motion";

const STATE_CONFIG = {
  idle: {
    label: "Ready to Talk",
    icon: Radio,
    badgeClasses: "bg-surface-high/70 text-on-surface-muted border-outline-variant/30",
    iconClasses: "text-on-surface-muted",
    dotClass: "bg-on-surface-muted",
  },
  connecting: {
    label: "Connecting...",
    icon: Loader2,
    badgeClasses: "bg-primary/15 text-primary border-primary/30",
    iconClasses: "text-primary animate-spin",
    dotClass: "bg-primary animate-ping",
  },
  listening: {
    label: "Listening to You",
    icon: Mic,
    badgeClasses: "bg-secondary/15 text-secondary-light border-secondary/40 shadow-[0_0_15px_rgba(78,222,163,0.2)]",
    iconClasses: "text-secondary-light animate-pulse",
    dotClass: "bg-secondary",
  },
  thinking: {
    label: "Aria is Thinking...",
    icon: Sparkles,
    badgeClasses: "bg-primary/20 text-primary-light border-primary/40 shadow-[0_0_15px_rgba(242,202,80,0.2)]",
    iconClasses: "text-primary-light animate-bounce",
    dotClass: "bg-primary",
  },
  speaking: {
    label: "Aria is Speaking",
    icon: Volume2,
    badgeClasses: "bg-secondary-container/20 text-secondary border-secondary/40 shadow-[0_0_20px_rgba(16,185,129,0.25)]",
    iconClasses: "text-secondary",
    dotClass: "bg-secondary animate-pulse",
  },
  ended: {
    label: "Call Ended",
    icon: PhoneOff,
    badgeClasses: "bg-surface/60 text-on-surface-muted border-outline-variant/20",
    iconClasses: "text-on-surface-muted",
    dotClass: "bg-on-surface-muted",
  },
  error: {
    label: "Connection Issue",
    icon: AlertCircle,
    badgeClasses: "bg-danger/20 text-danger border-danger/40",
    iconClasses: "text-danger",
    dotClass: "bg-danger",
  },
};

function StatePillComponent({ state = "idle", className = "" }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.idle;
  const Icon = cfg.icon;

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, scale: 0.9, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -6 }}
          transition={springGentle}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium tracking-wide backdrop-blur-md transition-colors ${cfg.badgeClasses}`}
          role="status"
          aria-live="polite"
        >
          <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`} aria-hidden="true" />
          <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.iconClasses}`} aria-hidden="true" />
          <span className="font-sans font-semibold">{cfg.label}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const StatePill = memo(StatePillComponent);
