"use client";

/**
 * components/ui/Button.js — Multi-variant button with spring animations
 *
 * Variants:
 * - "primary"  → Gold background, dark text (Golden Nectar)
 * - "danger"   → Error background
 * - "ghost"    → Transparent, text-only with hover fill
 *
 * Sizes: "sm" | "md" | "lg"
 *
 * @param {{
 *   variant?: "primary"|"danger"|"ghost",
 *   size?: "sm"|"md"|"lg",
 *   disabled?: boolean,
 *   loading?: boolean,
 *   children: React.ReactNode,
 *   className?: string,
 *   [key: string]: any
 * }} props
 */

import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { springSnap, tapScale, hoverLift } from "@/lib/motion";

const variantClasses = {
  primary: [
    "bg-primary text-on-primary font-semibold",
    "hover:shadow-[var(--glow-gold)]",
    "active:bg-primary-dim",
  ].join(" "),
  danger: [
    "bg-error-container text-error font-semibold",
    "hover:brightness-110",
  ].join(" "),
  ghost: [
    "bg-transparent text-on-surface-variant",
    "hover:bg-surface-high hover:text-on-surface",
    "border border-transparent hover:border-outline-variant",
  ].join(" "),
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-5 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-7 py-3 text-base rounded-2xl gap-2.5",
};

const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    disabled = false,
    loading = false,
    children,
    className,
    ...rest
  },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled ? undefined : tapScale}
      whileHover={disabled ? undefined : hoverLift}
      transition={springSnap}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-sans",
        "transition-colors duration-200 cursor-pointer select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </motion.button>
  );
});

export default Button;
