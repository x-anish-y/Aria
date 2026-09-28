"use client";

/**
 * components/ui/Modal.js — Adaptive overlay: side panel (desktop) / bottom sheet (mobile)
 *
 * Behavior:
 * - Desktop (≥768px): slides in from the right as a side panel
 * - Mobile (<768px): slides up from the bottom as a bottom sheet
 * - Both support drag-to-dismiss via Framer Motion
 * - Focus trap & Escape key support
 * - Backdrop click to close
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title?: string,
 *   children: React.ReactNode,
 *   className?: string,
 * }} props
 */

import { useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { springGentle, fadeIn } from "@/lib/motion";
import useMediaQuery from "@/lib/useMediaQuery";

export default function Modal({
  open,
  onClose,
  title,
  children,
  className,
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const contentRef = useRef(null);
  const dragControls = useDragControls();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Handle drag end — dismiss if dragged far enough
  const handleDragEnd = useCallback(
    (_, info) => {
      const threshold = isDesktop ? 100 : 80;
      const dismiss = isDesktop
        ? info.offset.x > threshold   // dragged right on desktop
        : info.offset.y > threshold;  // dragged down on mobile
      if (dismiss) onClose();
    },
    [isDesktop, onClose],
  );

  // Motion variants for each mode
  const panelVariants = isDesktop
    ? {
        hidden:  { x: "100%", opacity: 0 },
        visible: { x: 0, opacity: 1, transition: springGentle },
        exit:    { x: "100%", opacity: 0, transition: { duration: 0.25 } },
      }
    : {
        hidden:  { y: "100%", opacity: 0 },
        visible: { y: 0, opacity: 1, transition: springGentle },
        exit:    { y: "100%", opacity: 0, transition: { duration: 0.25 } },
      };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={contentRef}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            drag={isDesktop ? "x" : "y"}
            dragControls={dragControls}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className={cn(
              "absolute glass-floating",
              // Desktop: right side panel
              isDesktop && "right-0 top-0 h-full w-full max-w-md rounded-l-2xl",
              // Mobile: bottom sheet
              !isDesktop && "bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl",
              "flex flex-col overflow-hidden shadow-2xl",
              className,
            )}
          >
            {/* Drag handle (mobile) */}
            {!isDesktop && (
              <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="w-10 h-1 rounded-full bg-outline-variant" />
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
              {title && (
                <h2 className="font-serif text-lg font-medium text-ivory">
                  {title}
                </h2>
              )}
              <button
                onClick={onClose}
                className="ml-auto p-2 rounded-xl hover:bg-surface-high transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-on-surface-muted" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
