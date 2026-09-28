"use client";

/**
 * components/ui/Badge.js — Status badge with semantic colors
 *
 * Variants map to order/system statuses:
 * - "processing" → gold tint
 * - "shipped"    → emerald tint
 * - "delivered"  → secondary bright tint
 * - "cancelled"  → error tint
 * - "default"    → neutral outline
 *
 * @param {{
 *   variant?: "processing"|"shipped"|"delivered"|"cancelled"|"default",
 *   children: React.ReactNode,
 *   className?: string,
 *   dot?: boolean,
 * }} props
 */

import { cn } from "@/lib/cn";

const badgeStyles = {
  processing: "bg-primary/10 text-primary-light border-primary/20",
  shipped:    "bg-secondary/10 text-secondary-light border-secondary/20",
  delivered:  "bg-secondary-bright/10 text-secondary-bright border-secondary-bright/20",
  cancelled:  "bg-error/10 text-error border-error/20",
  default:    "bg-surface-high text-on-surface-variant border-outline-variant/30",
};

export default function Badge({
  variant = "default",
  children,
  className,
  dot = false,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1",
        "text-xs font-semibold rounded-full border",
        "whitespace-nowrap select-none",
        badgeStyles[variant],
        className,
      )}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
