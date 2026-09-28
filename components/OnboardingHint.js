"use client";

/**
 * components/OnboardingHint.js — First-Visit Onboarding Hint Overlay
 *
 * Requirements:
 * - On first visit: "Click Start Call, allow the mic, try one of the sample orders"
 * - Dismisses smoothly and remembers dismissal across visits in localStorage
 * - Premium botanical aesthetic consistent with Aura Skincare
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Phone, Mic, Package, X, Check } from "lucide-react";
import { springGentle } from "@/lib/motion";

const STORAGE_KEY = "aura_onboarding_dismissed";

export function OnboardingHint({ onDismiss }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setIsVisible(true);
      }
    } catch {
      // In case localStorage is disabled or in private mode
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
    onDismiss?.();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={springGentle}
          className="relative w-full mb-6 p-4 sm:p-5 rounded-3xl bg-surface-container/90 border border-primary/30 backdrop-blur-xl shadow-xl overflow-hidden"
          role="region"
          aria-label="First-time onboarding guide"
        >
          {/* Ambient luminous glow */}
          <div
            className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full pointer-events-none opacity-20 blur-2xl"
            style={{ background: "radial-gradient(circle, #f2ca50 0%, #10b981 100%)" }}
          />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Left Header & Brand Intro */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 shadow-sm text-primary-light">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-primary-light font-semibold bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                    Quick Start
                  </span>
                  <span className="text-xs text-on-surface-muted font-mono">
                    3 Simple Steps
                  </span>
                </div>
                <h3 className="font-serif text-base sm:text-lg font-medium text-ivory mt-0.5">
                  Welcome to Aura Voice Support
                </h3>
              </div>
            </div>

            {/* 3 Step Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full md:w-auto">
              {/* Step 1 */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-high/60 border border-outline-variant/15 text-xs">
                <div className="w-6 h-6 rounded-lg bg-primary/20 text-primary-light flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                  1
                </div>
                <span className="text-ivory font-medium">Click Start Call</span>
              </div>

              {/* Step 2 */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-high/60 border border-outline-variant/15 text-xs">
                <div className="w-6 h-6 rounded-lg bg-secondary/20 text-secondary-light flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                  2
                </div>
                <span className="text-ivory font-medium">Allow the Mic</span>
              </div>

              {/* Step 3 */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-high/60 border border-outline-variant/15 text-xs">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                  3
                </div>
                <span className="text-ivory font-medium">Try Sample Orders</span>
              </div>
            </div>

            {/* Dismiss Actions */}
            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <button
                onClick={handleDismiss}
                className="px-3.5 py-1.5 rounded-xl bg-primary text-black font-semibold text-xs hover:bg-primary-light transition-all shadow-md shadow-primary/20 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Got it</span>
              </button>

              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-xl text-on-surface-muted hover:text-ivory hover:bg-surface-high transition-colors"
                aria-label="Dismiss onboarding hint"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
