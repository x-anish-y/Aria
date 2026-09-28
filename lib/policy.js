/**
 * lib/policy.js — Aura Skincare Pure Business Logic Rules
 *
 * Rules:
 * 1. canCancel(order):
 *    - Allowed ONLY if status === "Processing".
 *    - "Shipped" or "Out for Delivery": cannot cancel, customer may refuse at doorstep.
 *    - "Delivered": already delivered.
 *    - "Cancellation Requested": already requested.
 *    - Returns { allowed, eligible, reason }.
 *
 * 2. canReturn(order):
 *    - Allowed ONLY if status === "Delivered" AND delivered_days_ago <= 7.
 *    - If delivered_days_ago > 7: returns reason citing day count vs 7-day limit.
 *    - If not Delivered: returns reason stating only delivered orders can be returned.
 *    - Always includes requiresUnopenedUnusedOriginalPackaging: true.
 *    - Always includes damagedDefectiveRule text.
 *    - Returns { allowed, eligible, reason, requiresUnopenedUnusedOriginalPackaging, damagedDefectiveRule }.
 *
 * 3. shippingFee(value):
 *    - Free (0) if order value > 499, else 50 (strictly Rs 499 pays Rs 50).
 *
 * 4. codAvailable(value):
 *    - Available if value <= 2500.
 */

export const DAMAGED_DEFECTIVE_RULE =
  "Damaged or defective products must be reported within 48 hours of delivery with photos, for a replacement.";

/**
 * Check if an order is eligible for reporting damaged or defective products.
 * Policy: Damaged or defective products must be reported within 48 hours of delivery with photos, for a replacement.
 * For non-delivered orders, returns not-applicable with reason noting customer can refuse at doorstep.
 *
 * @param {{ status?: string, delivered_days_ago?: number | null, deliveredDaysAgo?: number | null }} order
 * @returns {{ allowed: boolean, eligible: boolean, reason: string | null, ruleCited: string }}
 */
export function canReportDamage(order) {
  if (!order || typeof order !== "object") {
    return {
      allowed: false,
      eligible: false,
      reason: "Invalid order details.",
      ruleCited: "DAMAGE_WINDOW: Invalid order details.",
    };
  }

  const status = order.status;
  if (status !== "Delivered") {
    const reason = "not delivered yet; customer can refuse delivery at the doorstep if out for delivery";
    return {
      allowed: false,
      eligible: false,
      reason,
      ruleCited: `DAMAGE_WINDOW: ${reason}`,
    };
  }

  const daysAgo =
    typeof order.delivered_days_ago === "number"
      ? order.delivered_days_ago
      : typeof order.deliveredDaysAgo === "number"
      ? order.deliveredDaysAgo
      : null;

  if (daysAgo === null) {
    return {
      allowed: false,
      eligible: false,
      reason: "Delivery confirmation date is missing or not yet recorded.",
      ruleCited: "DAMAGE_WINDOW: Delivery confirmation date is missing.",
    };
  }

  if (daysAgo <= 2) {
    return {
      allowed: true,
      eligible: true,
      reason: null,
      ruleCited: "DAMAGE_WINDOW: damaged/defective reported within 48 hours of delivery.",
    };
  }

  const reason = `DAMAGE_WINDOW: delivered ${daysAgo} days ago, damaged/defective must be reported within 48 hours of delivery`;
  return {
    allowed: false,
    eligible: false,
    reason,
    ruleCited: reason,
  };
}

/**
 * Check if an order is eligible for cancellation.
 * @param {{ status?: string }} order
 * @returns {{ allowed: boolean, eligible: boolean, reason: string | null }}
 */
export function canCancel(order) {
  if (!order || typeof order !== "object" || !order.status) {
    return {
      allowed: false,
      eligible: false,
      reason: "Invalid or missing order details.",
    };
  }

  const status = order.status;

  if (status === "Processing") {
    return {
      allowed: true,
      eligible: true,
      reason: null,
    };
  }

  if (status === "Out for Delivery" || status === "Shipped") {
    return {
      allowed: false,
      eligible: false,
      reason:
        "Order is already " +
        status.toLowerCase() +
        " and cannot be cancelled directly. The customer may refuse delivery at their doorstep.",
    };
  }

  if (status === "Delivered") {
    return {
      allowed: false,
      eligible: false,
      reason: "Order is already delivered and cannot be cancelled.",
    };
  }

  if (status === "Cancellation Requested") {
    return {
      allowed: false,
      eligible: false,
      reason: "Order is already Cancellation Requested.",
    };
  }

  return {
    allowed: false,
    eligible: false,
    reason: `Order cannot be cancelled in status: ${status}.`,
  };
}

/**
 * Check if an order is eligible for return.
 * @param {{ status?: string, delivered_days_ago?: number | null }} order
 * @returns {{ allowed: boolean, eligible: boolean, reason: string | null, requiresUnopenedUnusedOriginalPackaging: boolean, damagedDefectiveRule: string }}
 */
export function canReturn(order) {
  const base = {
    requiresUnopenedUnusedOriginalPackaging: true,
    damagedDefectiveRule: DAMAGED_DEFECTIVE_RULE,
  };

  if (!order || typeof order !== "object" || order.status !== "Delivered") {
    const currentStatus = order?.status || "Unknown";
    return {
      allowed: false,
      eligible: false,
      reason: `Only delivered orders are eligible for return. This order status is "${currentStatus}".`,
      ...base,
    };
  }

  const daysAgo = typeof order.delivered_days_ago === "number" ? order.delivered_days_ago : null;

  if (daysAgo === null) {
    return {
      allowed: false,
      eligible: false,
      reason: "Delivery confirmation date is missing or not yet recorded.",
      ...base,
    };
  }

  if (daysAgo <= 7) {
    return {
      allowed: true,
      eligible: true,
      reason: null,
      ...base,
    };
  }

  return {
    allowed: false,
    eligible: false,
    reason: `Return window expired. The order was delivered ${daysAgo} days ago, exceeding the 7 days return policy limit.`,
    ...base,
  };
}

/**
 * Calculate shipping fee for given cart/order value in INR.
 * @param {number} value
 * @returns {number}
 */
export function shippingFee(value) {
  const numVal = Number(value) || 0;
  return numVal > 499 ? 0 : 50;
}

/**
 * Determine if Cash on Delivery (COD) is available.
 * @param {number} value
 * @returns {boolean}
 */
export function codAvailable(value) {
  const numVal = Number(value) || 0;
  return numVal <= 2500;
}
