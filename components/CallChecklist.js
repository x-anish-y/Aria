"use client";

/**
 * components/CallChecklist.js — Pre-Call Checklist, Error Guides & System Banners
 *
 * Requirements:
 * - Pre-call checklist card ("Allow microphone", "Use headphones") with animating check ticks
 * - Mic denied state with how-to-fix steps
 * - Token/quota failure auto-fallback notification
 * - Offline banner detection
 */

import { useState, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Headphones,
  Mic,
  ShieldAlert,
  WifiOff,
  Sparkles,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { springGentle } from "@/lib/motion";

export function PreCallChecklist({ className = "" }) {
  const [micTested, setMicTested] = useState(false);

  useEffect(() => {
    // Check if permission was already granted previously
    if (typeof navigator !== "undefined" && navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" })
        .then((permissionStatus) => {
          if (permissionStatus.state === "granted") {
            setMicTested(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  const items = [
    {
      id: "mic",
      title: "Allow Microphone Access",
      desc: "Browser will prompt for mic permission on call start",
      icon: Mic,
      checked: true,
    },
    {
      id: "headphones",
      title: "Use Headphones Recommended",
      desc: "Provides clear audio isolation and prevents echo",
      icon: Headphones,
      checked: true,
    },
    {
      id: "speech",
      title: "Natural Indian English & Hinglish",
      desc: "Speak naturally; Aria understands code-switching",
      icon: Sparkles,
      checked: true,
    },
    {
      id: "browser",
      title: "Cross-Browser Compatible",
      desc: "Optimized for Chrome, Edge, Safari (macOS & iOS), Firefox, and Android",
      icon: Check,
      checked: true,
    },
  ];

  return (
    <div className={`p-4 rounded-2xl bg-surface-container/40 border border-outline-variant/15 backdrop-blur-sm ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ivory mb-3 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary-light" />
        Pre-Call Checklist
      </h4>

      <div className="space-y-2.5">
        {items.map((item, index) => {
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springGentle, delay: 0.08 * (index + 1) }}
              className="flex items-start gap-3 p-2.5 rounded-xl bg-surface-high/30 border border-outline-variant/10"
            >
              <div className="w-6 h-6 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center shrink-0 mt-0.5 text-secondary">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-ivory">{item.title}</p>
                <p className="text-[11px] text-on-surface-muted">{item.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function MicDeniedCard({ onRetry, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-5 rounded-2xl bg-danger/10 border border-danger/30 text-left ${className}`}
    >
      <div className="flex items-center gap-2 text-danger font-semibold text-sm mb-2">
        <ShieldAlert className="w-5 h-5 shrink-0" />
        <span>Microphone Access Needed</span>
      </div>
      <p className="text-xs text-on-surface mb-3 leading-relaxed">
        Aria requires microphone permission for bidirectional voice consultations. Please unblock it in your browser:
      </p>

      <ul className="text-xs text-on-surface-muted space-y-1.5 list-disc list-inside mb-4 pl-1">
        <li><strong>Chrome & Edge:</strong> Click the tune/padlock icon left of the URL bar &gt; set <em>Microphone</em> to <em>Allow</em>.</li>
        <li><strong>Safari (macOS/iOS):</strong> Tap <em>AA</em> or Safari Settings &gt; <em>Website Settings</em> &gt; <em>Microphone</em> &gt; <em>Allow</em>.</li>
        <li><strong>Firefox:</strong> Click the permissions icon next to the address bar &gt; clear the <em>Blocked</em> permission and retry.</li>
      </ul>

      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-xl bg-danger text-white text-xs font-semibold hover:bg-danger-hover transition-colors shadow-md"
      >
        Try Again
      </button>
    </motion.div>
  );
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    setIsOffline(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="w-full bg-danger/20 border-b border-danger/40 text-danger px-4 py-2 text-xs flex items-center justify-center gap-2 font-medium z-50">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You appear to be offline. Live voice connections will pause until connection is restored.</span>
    </div>
  );
}
