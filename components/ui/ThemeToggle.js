"use client";

/**
 * components/ui/ThemeToggle.js — Animated dark/light theme toggle
 *
 * Renders a sun/moon icon that morphs between states.
 * Persists preference via ThemeProvider.
 *
 * @param {{ className?: string }} props
 */

import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "@/components/ThemeProvider";
import { springSnap, tapScale } from "@/lib/motion";

export default function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <motion.button
      onClick={toggle}
      whileTap={tapScale}
      transition={springSnap}
      className={cn(
        "relative p-2.5 rounded-xl",
        "bg-surface-high hover:bg-surface-highest",
        "transition-colors duration-200 cursor-pointer",
        "border border-outline-variant/20",
        className,
      )}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
    >
      <motion.span
        key={theme}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
        transition={springSnap}
        className="block"
      >
        {isDark ? (
          <Sun className="w-5 h-5 text-primary-light" />
        ) : (
          <Moon className="w-5 h-5 text-primary" />
        )}
      </motion.span>
    </motion.button>
  );
}
