"use client";

/**
 * components/Navbar.js — Primary Top Navigation with Animated Active Indicator
 *
 * Requirements:
 * 1. Brand identity (Aria • Ayurvedic AI)
 * 2. Small nav (Call / Insights) with animated active indicator (Framer Motion layoutId)
 * 3. Mode badge and theme toggle
 * 4. Responsive design
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, PhoneCall, BarChart3, History, Volume2, VolumeX } from "lucide-react";
import { Badge, ThemeToggle, Tooltip } from "@/components/ui";
import { tapScale, hoverLift, springSnap } from "@/lib/motion";
import {
  isSoundCuesEnabled,
  setSoundCuesEnabled,
  playCallStartCue,
} from "@/lib/sound-cues";

export function Navbar({ mode = "realtime", onOpenHistory }) {
  const pathname = usePathname();
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    setSoundEnabled(isSoundCuesEnabled());
  }, []);

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    setSoundCuesEnabled(nextState);
    if (nextState) {
      playCallStartCue();
    }
  };

  const navItems = [
    { label: "Call", href: "/", icon: PhoneCall },
    { label: "Insights", href: "/insights", icon: BarChart3 },
  ];

  return (
    <header className="flex items-center justify-between px-4 sm:px-8 py-3.5 border-b border-outline-variant/15 bg-surface/50 backdrop-blur-md sticky top-0 z-30">
      {/* ── Brand identity ────────────────────────────────────────── */}
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shadow-sm group-hover:border-primary/60 transition-colors">
          <Sparkles className="w-5 h-5 text-primary-light" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-lg font-medium text-ivory tracking-tight group-hover:text-primary-light transition-colors">
              Aria
            </h1>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-surface-high border border-outline-variant/20 text-secondary-light">
              Botanical AI
            </span>
          </div>
          <p className="text-[11px] text-on-surface-muted hidden sm:block">
            Aura Skincare • Voice Support
          </p>
        </div>
      </Link>

      {/* ── Center Nav Switcher with Animated Pill Indicator ──────── */}
      <nav
        aria-label="Main Navigation"
        className="flex items-center p-1 rounded-full bg-surface-container/90 border border-outline-variant/25 shadow-inner"
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative px-4 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-2 z-10 ${
                isActive
                  ? "text-ivory font-semibold"
                  : "text-on-surface-muted hover:text-on-surface"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute inset-0 rounded-full bg-surface-highest border border-outline-variant/30 shadow-sm"
                  transition={springSnap}
                  style={{ zIndex: -1 }}
                />
              )}
              <Icon
                className={`w-3.5 h-3.5 ${
                  isActive ? "text-primary-light" : "text-on-surface-muted"
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Header Right Controls ─────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        {/* Subtle Call Sound Chimes Toggle */}
        <Tooltip
          side="bottom"
          align="end"
          content={
            soundEnabled
              ? "Call sound cues: Enabled (Click to mute)"
              : "Call sound cues: Muted by default (Click to enable)"
          }
        >
          <motion.button
            whileTap={tapScale}
            whileHover={hoverLift}
            onClick={toggleSound}
            className={`p-2 rounded-full border text-xs transition-colors shadow-sm ${
              soundEnabled
                ? "bg-primary/15 text-primary-light border-primary/40"
                : "bg-surface-container text-on-surface-muted border-outline-variant/30 hover:text-ivory"
            }`}
            title={
              soundEnabled
                ? "Call sound cues: Enabled (Click to mute)"
                : "Call sound cues: Muted by default (Click to enable)"
            }
            aria-label={
              soundEnabled ? "Disable call sound cues" : "Enable call sound cues"
            }
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-primary-light" />
            ) : (
              <VolumeX className="w-4 h-4 text-on-surface-muted" />
            )}
          </motion.button>
        </Tooltip>

        {onOpenHistory && (
          <Tooltip side="bottom" align="center" content="View previous call records & evaluations">
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-on-surface bg-surface-container border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-high transition-colors shadow-sm"
              title="View past calls & summaries"
            >
              <History className="w-3.5 h-3.5 text-secondary-light" />
              <span className="hidden md:inline">Call History</span>
            </motion.button>
          </Tooltip>
        )}

        {/* Active Mode indicator */}
        <Badge
          variant={mode === "realtime" ? "delivered" : "processing"}
          dot
          className="hidden sm:inline-flex text-xs font-mono"
        >
          {mode === "realtime" ? "Gemini Live" : "Groq Fallback"}
        </Badge>

        {/* Theme Toggle */}
        <ThemeToggle />
      </div>
    </header>
  );
}
