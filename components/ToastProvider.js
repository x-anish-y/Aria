"use client";

/**
 * components/ToastProvider.js — Lightweight toast notification system
 *
 * Usage:
 *   const { addToast } = useToast();
 *   addToast({ message: "Saved!", type: "success" });
 *
 * Types: "info" | "success" | "warning" | "error"
 * Each toast auto-dismisses after `duration` ms (default 4000).
 */

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { springSnap } from "@/lib/motion";

/**
 * @typedef {Object} Toast
 * @property {string}  id
 * @property {string}  message
 * @property {"info"|"success"|"warning"|"error"} [type="info"]
 * @property {number}  [duration=4000]
 */

const ToastCtx = createContext(/** @type {{ addToast: (t: Omit<Toast,"id">) => void }} */ ({}));

const ICONS = {
  info:    Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error:   AlertCircle,
};

const TYPE_STYLES = {
  info:    "border-secondary/20 text-secondary-light",
  success: "border-secondary/20 text-secondary-light",
  warning: "border-primary/20 text-primary-light",
  error:   "border-error/20 text-error",
};

let _toastId = 0;

/**
 * ToastProvider — wraps the app; renders the toast stack.
 * @param {{ children: React.ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(/** @type {Toast[]} */ ([]));

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    /** @param {Omit<Toast,"id">} toast */
    (toast) => {
      const id = `toast-${++_toastId}`;
      const duration = toast.duration ?? 4000;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast],
  );

  return (
    <ToastCtx.Provider value={{ addToast }}>
      {children}

      {/* Toast container — fixed bottom-right, above everything */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => {
            const Icon = ICONS[t.type ?? "info"];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: springSnap }}
                exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
                className={cn(
                  "glass-elevated pointer-events-auto rounded-xl px-4 py-3",
                  "flex items-start gap-3 shadow-lg",
                  TYPE_STYLES[t.type ?? "info"],
                )}
              >
                <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm flex-1 text-on-surface">{t.message}</p>
                <button
                  onClick={() => removeToast(t.id)}
                  className="shrink-0 p-1 rounded-lg hover:bg-surface-high transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X className="w-4 h-4 text-on-surface-muted" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * useToast — access addToast to show notifications.
 * @returns {{ addToast: (t: Omit<Toast,"id">) => void }}
 */
export function useToast() {
  return useContext(ToastCtx);
}
