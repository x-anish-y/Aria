"use client";

/**
 * components/ui/GlassCard.js — Glassmorphism card component
 *
 * Three elevation tiers matching the design system:
 * - "rest"     → Tier 1: subtle glass, blur(16px)
 * - "elevated" → Tier 2: stronger glass, blur(28px), dual borders
 * - "floating" → Tier 3: opaque glass, golden rim
 *
 * @param {{ tier?: "rest"|"elevated"|"floating", className?: string, children: React.ReactNode, as?: string, [key: string]: any }} props
 */

import { forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { fadeUp } from "@/lib/motion";

const tierClasses = {
  rest:     "glass rounded-2xl",
  elevated: "glass-elevated rounded-2xl",
  floating: "glass-floating rounded-2xl",
};

const GlassCard = forwardRef(function GlassCard(
  { tier = "rest", className, children, animate = true, ...rest },
  ref,
) {
  const Component = animate ? motion.div : "div";
  const motionProps = animate
    ? { variants: fadeUp, initial: "hidden", animate: "visible", exit: "exit" }
    : {};

  return (
    <Component
      ref={ref}
      className={cn(tierClasses[tier], "p-4 md:p-6", className)}
      {...motionProps}
      {...rest}
    >
      {children}
    </Component>
  );
});

export default GlassCard;
