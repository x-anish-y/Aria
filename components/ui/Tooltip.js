"use client";

/**
 * components/ui/Tooltip.js — Accessible tooltip with Framer Motion
 *
 * Appears on hover/focus with a slight delay.
 * Positioned above the trigger by default.
 *
 * @param {{
 *   content: string,
 *   children: React.ReactNode,
 *   side?: "top"|"bottom",
 *   className?: string,
 * }} props
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { scaleIn } from "@/lib/motion";

export default function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}

      <AnimatePresence>
        {open && Boolean(content) && (
          <div
            className={cn(
              "absolute z-50 pointer-events-none whitespace-nowrap",
              side === "top" && "bottom-full mb-2",
              side === "bottom" && "top-full mt-2",
              align === "center" && "left-1/2 -translate-x-1/2",
              align === "start" && "left-0",
              align === "end" && "right-0"
            )}
          >
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, scale: 0.94, y: side === "bottom" ? -4 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: side === "bottom" ? -2 : 2 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium",
                "bg-surface-highest text-ivory rounded-lg",
                "shadow-2xl border border-outline-variant/40",
                className
              )}
            >
              {content}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
