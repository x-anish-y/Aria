"use client";

/**
 * components/TestOrdersPanel.js — Interactive Order Cards, "Try Saying" Prompts & Demo Reset
 *
 * Requirements:
 * - Always visible on desktop; bottom sheet drawer on mobile via floating button
 * - Three order cards: customer, product, value, status badge, notes, Copy ID (with check animation)
 * - Highlight animation on the card the agent just looked up
 * - Status changes (e.g. ORD-103 -> Cancellation Requested) animate live
 * - "Try saying" chips (6 scenarios):
 *   1. tracking ORD-101
 *   2. cancel ORD-101 (refused)
 *   3. cancel ORD-103 (allowed)
 *   4. return ORD-102 (outside window)
 *   5. invalid ORD-999
 *   6. book a flight to Goa
 * - Reset demo data button (calls /api/reset with toast)
 */

import { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
} from "lucide-react";
import { Badge, Chip, GlassCard } from "@/components/ui";
import { springGentle, springSnap } from "@/lib/motion";
import { getBrand } from "@/lib/brands";

const TRY_SAYING_PROMPTS = [
  {
    id: "track-101",
    label: "Where is ORD-101?",
    prompt: "Where is my order ORD-101?",
    desc: "Tracking lookup",
  },
  {
    id: "cancel-101",
    label: "Cancel ORD-101",
    prompt: "I want to cancel order ORD-101.",
    desc: "Refused (Out for Delivery)",
  },
  {
    id: "cancel-103",
    label: "Cancel ORD-103",
    prompt: "Please cancel order ORD-103 for me.",
    desc: "Allowed (Processing)",
  },
  {
    id: "return-102",
    label: "Return ORD-102",
    prompt: "I would like to return order ORD-102.",
    desc: "Refused (>7 days delivered)",
  },
  {
    id: "invalid-999",
    label: "Check ORD-999",
    prompt: "Can you check order ORD-999?",
    desc: "Invalid order ID",
  },
  {
    id: "flight-goa",
    label: "Book flight to Goa",
    prompt: "Can you book me a flight to Goa this weekend?",
    desc: "Out of scope steer",
  },
];

const KAVERI_TRY_SAYING_PROMPTS = [
  {
    id: "track-201",
    label: "Where is KAV-201?",
    prompt: "Where is my order KAV-201?",
    desc: "Tracking lookup",
  },
  {
    id: "cancel-201",
    label: "Cancel KAV-201",
    prompt: "I want to cancel order KAV-201.",
    desc: "Refused (Out for Delivery)",
  },
  {
    id: "cancel-203",
    label: "Cancel KAV-203",
    prompt: "Please cancel order KAV-203 for me.",
    desc: "Allowed (Processing)",
  },
  {
    id: "return-202",
    label: "Return KAV-202",
    prompt: "I would like to return order KAV-202.",
    desc: "Refused (Perishable food)",
  },
  {
    id: "invalid-999",
    label: "Check KAV-999",
    prompt: "Can you check order KAV-999?",
    desc: "Invalid order ID",
  },
  {
    id: "cross-brand-ord-101",
    label: "Check ORD-101",
    prompt: "Can you check status of order ORD-101?",
    desc: "Cross-brand refusal test",
  },
];

const DEFAULT_ORDERS = [
  {
    order_id: "ORD-101",
    customer_name: "Priya Sharma",
    product: "Vitamin C Serum (30ml)",
    value_inr: 699,
    status: "Out for Delivery",
    courier: "BlueDart",
    tracking_id: "BD-982103",
    expected_delivery: "Expected by 6 PM today",
    notes: "Shipped & out for delivery. Doorstep refusal only.",
  },
  {
    order_id: "ORD-102",
    customer_name: "Rahul Verma",
    product: "Kumkumadi Facial Oil (50ml)",
    value_inr: 1499,
    status: "Delivered",
    courier: "Delhivery",
    tracking_id: "DEL-441209",
    delivered_days_ago: 12,
    notes: "Delivered 12 days ago. Outside 7-day return policy.",
  },
  {
    order_id: "ORD-103",
    customer_name: "Ananya Patel",
    product: "Radiance Day Cream (50g)",
    value_inr: 449,
    status: "Processing",
    courier: null,
    tracking_id: null,
    placed_hours_ago: 2,
    notes: "Under processing. Eligible for immediate cancellation.",
  },
];

function TestOrdersPanelComponent({
  sessionId = "default-session",
  lastToolEvent = null,
  onSelectPrompt = null,
  onToast = null,
  brandId = "aura",
  className = "",
}) {
  const brand = getBrand(brandId);
  const tryPrompts = brand.id === "kaveri" ? KAVERI_TRY_SAYING_PROMPTS : TRY_SAYING_PROMPTS;

  const initialOrders = brand.testOrders.map((o) => ({
    order_id: o.id,
    customer_name: o.customerName,
    product: o.product,
    value_inr: o.valueInr,
    status: o.status,
    notes: o.notes,
  }));

  const [orders, setOrders] = useState(initialOrders);
  const [copiedId, setCopiedId] = useState(null);
  const [highlightedOrderId, setHighlightedOrderId] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Fetch orders from API filtered by brand
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/orders?sessionId=${encodeURIComponent(sessionId)}&brandId=${encodeURIComponent(brandId)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.orders)) {
          setOrders(data.orders);
        }
      }
    } catch (err) {
      console.warn("[TestOrdersPanel] Failed to fetch live orders:", err);
    }
  }, [sessionId, brandId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, brandId]);

  // Highlight card when agent looks up or modifies an order
  useEffect(() => {
    if (!lastToolEvent) return;

    const args = lastToolEvent.args || {};
    const targetId = args.orderId || args.order_id;
    if (targetId) {
      const normalized = targetId.toUpperCase();
      setHighlightedOrderId(normalized);

      // Re-fetch live orders on cancellation or modification
      fetchOrders();

      const timer = setTimeout(() => {
        setHighlightedOrderId(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [lastToolEvent, fetchOrders]);

  // Copy order ID with checkmark animation
  const handleCopy = (orderId) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(orderId);
      setCopiedId(orderId);
      onToast?.(`Copied ${orderId} to clipboard`, "info");
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Reset demo data
  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        onToast?.("Demo data reset to initial catalog values", "info");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("aria:reset-tour", { detail: { sessionId } })
          );
        }
        await fetchOrders();
      } else {
        onToast?.(data.error || "Reset failed", "error");
      }
    } catch (err) {
      onToast?.(err.message || "Failed to reset demo data", "error");
    } finally {
      setIsResetting(false);
    }
  };

  const getStatusBadgeVariant = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("delivered")) return "delivered";
    if (s.includes("shipped") || s.includes("out for delivery")) return "shipped";
    if (s.includes("cancellation") || s.includes("cancel")) return "cancelled";
    return "processing";
  };

  const panelContent = (
    <div className="flex flex-col gap-5">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-outline-variant/15">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary-light" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ivory">
            Interactive Test Catalog
          </h2>
        </div>
        <button
          onClick={handleReset}
          disabled={isResetting}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-high/60 hover:bg-surface-high border border-outline-variant/20 text-xs text-on-surface hover:text-ivory transition-all disabled:opacity-50"
          title="Reset session overrides (cancellations and tickets)"
        >
          <RotateCcw className={`w-3.5 h-3.5 text-secondary-light ${isResetting ? "animate-spin" : ""}`} />
          <span>Reset Demo</span>
        </button>
      </div>

      {/* 3 Live Order Cards */}
      <div className="space-y-3.5">
        {orders.map((ord) => {
          const isHighlighted = highlightedOrderId === ord.order_id;
          const isCopied = copiedId === ord.order_id;

          return (
            <motion.div
              key={ord.order_id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: isHighlighted ? 1.02 : 1,
                boxShadow: isHighlighted
                  ? "0 0 25px rgba(242, 202, 80, 0.4), inset 0 0 15px rgba(78, 222, 163, 0.15)"
                  : "var(--glow-rest)",
              }}
              transition={springGentle}
              className={`p-3.5 rounded-2xl border transition-all ${
                isHighlighted
                  ? "bg-surface-high/90 border-primary shadow-lg"
                  : "bg-surface-container/60 border-outline-variant/20 hover:border-outline-variant/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                {/* Order ID + Copy Button */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-ivory">
                    {ord.order_id}
                  </span>
                  <button
                    onClick={() => handleCopy(ord.order_id)}
                    className="p-1 rounded hover:bg-surface-high text-on-surface-muted hover:text-ivory transition-colors"
                    title="Copy Order ID"
                    aria-label={`Copy ${ord.order_id}`}
                  >
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-secondary" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Status Badge */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={ord.status}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <Badge variant={getStatusBadgeVariant(ord.status)} dot>
                      {ord.status}
                    </Badge>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Product and customer details */}
              <div className="space-y-1 mb-2">
                <p className="text-xs font-semibold text-ivory">
                  {ord.product}
                </p>
                <div className="flex items-center justify-between text-[11px] text-on-surface-muted">
                  <span>{ord.customer_name}</span>
                  <span className="font-mono font-medium text-ivory">
                    ₹{ord.value_inr}
                  </span>
                </div>
              </div>

              {/* Tracking or Timing note */}
              {ord.tracking_id && (
                <div className="text-[11px] text-secondary-light font-mono flex items-center justify-between bg-surface-lowest/40 px-2 py-1 rounded">
                  <span>{ord.courier}</span>
                  <span>{ord.tracking_id}</span>
                </div>
              )}

              {/* Policy context / Notes */}
              {ord.notes && (
                <p className="text-[10px] text-on-surface-muted italic mt-2 border-t border-outline-variant/10 pt-1.5">
                  {ord.notes}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* "Try Saying" Interactive Chips */}
      <div className="space-y-2.5 pt-2 border-t border-outline-variant/15">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary-light" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ivory">
            Try Saying to {brand.persona_name}
          </h3>
        </div>
        <p className="text-[11px] text-on-surface-muted">
          Click any scenario to test {brand.persona_name}’s guardrails, tool calls, and policies:
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {tryPrompts.map((item) => (
            <Chip
              key={item.id}
              onClick={() => onSelectPrompt?.(item.prompt)}
              className="text-xs hover:border-primary/50 group cursor-pointer"
              title={`${item.desc}: "${item.prompt}"`}
            >
              <span>{item.label}</span>
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Panel */}
      <div className={`hidden lg:block ${className}`}>
        <GlassCard tier="elevated" className="p-5 h-full">
          {panelContent}
        </GlassCard>
      </div>

      {/* Mobile Floating Drawer Trigger Button */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsMobileOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-elevated/95 border border-primary/40 text-xs font-semibold text-ivory shadow-2xl backdrop-blur-md"
          aria-label="Open Demo Orders Panel"
        >
          <Package className="w-4 h-4 text-primary" />
          <span>Demo Orders &amp; Prompts</span>
        </motion.button>
      </div>

      {/* Mobile Bottom Sheet Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={springGentle}
              className="w-full max-h-[85vh] bg-surface-elevated border-t border-outline-variant/30 rounded-t-3xl p-5 overflow-y-auto shadow-2xl safe-area-pb"
            >
              {/* Drawer Handle */}
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-1 rounded-full bg-outline-variant/40 mx-auto" />
                <button
                  onClick={() => setIsMobileOpen(false)}
                  className="p-1 rounded-full hover:bg-surface-high text-on-surface-muted hover:text-ivory"
                  aria-label="Close Drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {panelContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export const TestOrdersPanel = memo(TestOrdersPanelComponent);
