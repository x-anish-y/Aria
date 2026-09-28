"use client";

/**
 * components/ui/Chip.js — Pill-shaped interactive chip
 *
 * Used for: skin concerns, product tags, quick-action suggestions.
 * Matches the "Dosage Tags" spec: pill shape, emerald border, parchment text.
 *
 * @param {{
 *   active?: boolean,
 *   onClick?: () => void,
 *   children: React.ReactNode,
 *   className?: string,
 *   icon?: React.ReactNode,
 * }} props
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { springSnap, tapScale } from "@/lib/motion";

export default function Chip({
  active = false,
  onClick,
  children,
  className,
  icon,
}) {
  return (
    <motion.button
      type="button"
      whileTap={onClick ? tapScale : undefined}
      transition={springSnap}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5",
        "text-xs font-medium rounded-full",
        "border transition-all duration-200 select-none",
        active
          ? "bg-primary/15 border-primary/30 text-primary-light shadow-[var(--glow-gold)]"
          : "bg-surface-high/80 border-outline-variant/30 text-parchment",
        onClick && "cursor-pointer hover:border-secondary-bright/40",
        !onClick && "cursor-default",
        className,
      )}
      aria-pressed={onClick ? active : undefined}
    >
      {icon && <span className="w-3.5 h-3.5" aria-hidden="true">{icon}</span>}
      {children}
    </motion.button>
  );
}
