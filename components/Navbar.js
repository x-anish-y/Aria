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
import { Sparkles, PhoneCall, BarChart3, History, Volume2, VolumeX, Brain } from "lucide-react";
import { Badge, ThemeToggle, Tooltip } from "@/components/ui";
import { tapScale, hoverLift, springSnap } from "@/lib/motion";
import { isSoundCuesEnabled, setSoundCuesEnabled, playCallStartCue } from "@/lib/sound-cues";
import { GuidedTourProgressRing } from "@/components/GuidedTourCard";
import { getBrand } from "@/lib/brands";

export function Navbar({
  mode = "realtime",
  onSwitchMode,
  activeBrandId = "aura",
  onSwitchBrand,
  isInCall = false,
  onOpenHistory,
  onOpenBrain,
  brainEventsCount = 0,
  onOpenTour,
  tourPassedCount = 0,
  tourTotalCount = 8,
}) {
  const pathname = usePathname();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const brand = getBrand(activeBrandId);

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
      {/* ── Brand identity & Brand Switcher ────────────────────────── */}
      <div className="flex items-center gap-3.5">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shadow-sm group-hover:border-primary/60 transition-colors text-base">
            {brand.id === "kaveri" ? "☕" : <Sparkles className="w-5 h-5 text-primary-light" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-lg font-medium text-ivory tracking-tight group-hover:text-primary-light transition-colors">
                {brand.persona_name}
              </h1>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-surface-high border border-outline-variant/20 text-secondary-light">
                {brand.id === "kaveri" ? "Specialty Coffee" : "Botanical AI"}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-muted hidden sm:block">
              {brand.name} • Voice Support
            </p>
          </div>
        </Link>

        {/* Animated Brand Switcher Pill */}
        <Tooltip
          side="bottom"
          align="start"
          content={
            isInCall
              ? "Brand switching is locked during an active call. Please end the call to switch brands."
              : `Active brand: ${brand.name}. Click to switch.`
          }
        >
          <div
            role="radiogroup"
            aria-label="Brand Selector"
            className={`flex items-center p-0.5 rounded-full bg-surface-container/90 border border-outline-variant/25 shadow-inner transition-opacity ${
              isInCall ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={activeBrandId === "aura"}
              disabled={isInCall}
              onClick={() => !isInCall && onSwitchBrand?.("aura")}
              className={`relative px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 z-10 ${
                activeBrandId === "aura"
                  ? "text-ivory font-semibold shadow-sm"
                  : "text-on-surface-muted hover:text-on-surface"
              } ${isInCall ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              {activeBrandId === "aura" && (
                <motion.div
                  layoutId="active-brand-indicator"
                  className="absolute inset-0 rounded-full bg-surface-highest border border-primary/40 shadow-sm"
                  transition={springSnap}
                  style={{ zIndex: -1 }}
                />
              )}
              <span className="text-xs">✨</span>
              <span className="hidden sm:inline">Aura</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={activeBrandId === "kaveri"}
              disabled={isInCall}
              onClick={() => !isInCall && onSwitchBrand?.("kaveri")}
              className={`relative px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 z-10 ${
                activeBrandId === "kaveri"
                  ? "text-ivory font-semibold shadow-sm"
                  : "text-on-surface-muted hover:text-on-surface"
              } ${isInCall ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              {activeBrandId === "kaveri" && (
                <motion.div
                  layoutId="active-brand-indicator"
                  className="absolute inset-0 rounded-full bg-surface-highest border border-primary/40 shadow-sm"
                  transition={springSnap}
                  style={{ zIndex: -1 }}
                />
              )}
              <span className="text-xs">☕</span>
              <span className="hidden sm:inline">Kaveri</span>
            </button>
          </div>
        </Tooltip>
      </div>

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

        {onOpenTour && (
          <Tooltip
            side="bottom"
            align="center"
            content={`Guided Test Checklist: ${tourPassedCount}/${tourTotalCount} scenarios passed`}
          >
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={onOpenTour}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shadow-sm ${
                tourPassedCount === tourTotalCount && tourTotalCount > 0
                  ? "bg-secondary/20 text-secondary-light border-secondary/40"
                  : "bg-surface-container text-on-surface border-outline-variant/30 hover:border-primary/40 hover:bg-surface-high"
              }`}
              title="Guided Test Checklist"
            >
              <GuidedTourProgressRing
                passedCount={tourPassedCount}
                totalCount={tourTotalCount}
                size={18}
                strokeWidth={2.5}
              />
              <span className="hidden md:inline">Tour</span>
              <span className="text-[11px] font-mono font-bold">
                {tourPassedCount}/{tourTotalCount}
              </span>
            </motion.button>
          </Tooltip>
        )}

        {onOpenBrain && (
          <Tooltip side="bottom" align="center" content="Live Agent Brain reasoning & policy verdicts">
            <motion.button
              whileTap={tapScale}
              whileHover={hoverLift}
              onClick={onOpenBrain}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-on-surface bg-surface-container border border-primary/30 hover:border-primary/60 hover:bg-surface-high transition-colors shadow-sm"
              title="Open Agent Brain reasoning drawer"
            >
              <Brain className="w-3.5 h-3.5 text-primary animate-pulse" />
              <span className="hidden md:inline">Agent Brain</span>
              {brainEventsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-primary text-black">
                  {brainEventsCount}
                </span>
              )}
            </motion.button>
          </Tooltip>
        )}

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

        {/* Active Voice Mode Toggle Button */}
        <Tooltip
          side="bottom"
          align="end"
          content={
            mode === "realtime"
              ? "Voice Mode: Gemini Live (Realtime Audio). Click to switch to Groq Fallback."
              : "Voice Mode: Groq Fallback (Web Speech + LLM). Click to switch to Gemini Live."
          }
        >
          <motion.button
            type="button"
            role="switch"
            aria-checked={mode === "realtime"}
            whileTap={tapScale}
            whileHover={hoverLift}
            onClick={() => onSwitchMode?.(mode === "realtime" ? "classic" : "realtime")}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium border transition-all cursor-pointer shadow-sm ${
              mode === "realtime"
                ? "bg-secondary/15 text-secondary-light border-secondary/35 hover:bg-secondary/25 hover:border-secondary/50"
                : "bg-amber-500/15 text-amber-300 border-amber-500/35 hover:bg-amber-500/25 hover:border-amber-500/50"
            }`}
            aria-label={`Current voice mode: ${
              mode === "realtime" ? "Gemini Live" : "Groq Fallback"
            }. Click to switch to ${mode === "realtime" ? "Groq Fallback" : "Gemini Live"}.`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                mode === "realtime" ? "bg-secondary-light animate-pulse" : "bg-amber-400"
              }`}
            />
            <span>{mode === "realtime" ? "Gemini Live" : "Groq Fallback"}</span>
          </motion.button>
        </Tooltip>

        {/* Dark/Light Theme Toggle */}
        <Tooltip
          side="bottom"
          align="end"
          content="Toggle dark / light theme"
        >
          <div>
            <ThemeToggle />
          </div>
        </Tooltip>
      </div>
    </header>
  );
}
