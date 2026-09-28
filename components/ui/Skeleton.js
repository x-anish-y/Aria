"use client";

/**
 * components/ui/Skeleton.js — Loading skeleton placeholder
 *
 * Renders a pulsing placeholder shape. Use for loading states
 * to prevent layout shift (same dimensions as final content).
 *
 * @param {{
 *   className?: string,
 *   rounded?: "sm"|"md"|"lg"|"xl"|"full",
 *   width?: string|number,
 *   height?: string|number,
 * }} props
 */

import { cn } from "@/lib/cn";

const roundedMap = {
  sm:   "rounded-sm",
  md:   "rounded-md",
  lg:   "rounded-lg",
  xl:   "rounded-xl",
  full: "rounded-full",
};

export default function Skeleton({
  className,
  rounded = "lg",
  width,
  height,
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-surface-high/60",
        roundedMap[rounded],
        className,
      )}
      style={{ width, height }}
    />
  );
}
