/**
 * lib/policy.js — Aura Skincare Pure Business Logic Rules
 *
 * Rules:
 * 1. canCancel(order):
 *    - Allowed ONLY if status === "Processing".
 *    - "Shipped" or "Out for Delivery": cannot cancel, customer may refuse at doorstep.
 *    - "Delivered": already delivered.
 *    - "Cancellation Requested": already requested.
 *    - Returns { allowed, eligible, reason, explanation, ruleCited }.
 *
 * 2. canReturn(order):
 *    - Allowed ONLY if status === "Delivered" AND delivered_days_ago <= 7.
 *    - If delivered_days_ago > 7: returns reason citing day count vs 7-day limit.
 *    - If not Delivered: returns reason stating only delivered orders can be returned.
 *    - Always includes requiresUnopenedUnusedOriginalPackaging: true.
 *    - Always includes damagedDefectiveRule text.
 *    - Returns { allowed, eligible, reason, explanation, ruleCited, requiresUnopenedUnusedOriginalPackaging, damagedDefectiveRule }.
 *
 * 3. canReportDamage(order):
 *    - Allowed ONLY if status === "Delivered" AND delivered_days_ago <= 2 (48 hours).
 *    - Returns { allowed, eligible, reason, explanation, ruleCited }.
 *
 * 4. shippingFee(value):
 *    - Free (0) if order value > 499, else 50 (strictly Rs 499 pays Rs 50).
 *    - Returns { fee, amount, allowed, reason, explanation, ruleCited }.
 *
 * 5. codAvailable(value):
 *    - Available if value <= 2500.
 *    - Returns { available, allowed, eligible, reason, explanation, ruleCited }.
 */

import { DEFAULT_AURA_POLICIES, KAVERI_COFFEE_POLICIES, getBrandPolicies } from "./brands.js";

export const DAMAGED_DEFECTIVE_RULE = DEFAULT_AURA_POLICIES.damagedRuleText;

/**
 * Helper to resolve the active brand policies from order metadata or explicit policies param.
 *
 * @param {object} [order]
 * @param {object} [policies]
 * @returns {typeof DEFAULT_AURA_POLICIES}
 */
function resolvePolicies(order, policies) {
  if (order?.brand_id || order?.brandId) {
    const orderBrandId = order.brand_id || order.brandId;
    if (policies && policies.brandId && policies.brandId === orderBrandId) {
      return policies;
    }
    return getBrandPolicies(orderBrandId);
  }
  if (policies && typeof policies === "object" && policies.brandId) {
    return policies;
  }
  return DEFAULT_AURA_POLICIES;
}

/**
 * Check if an order is eligible for reporting damaged or defective products.
 *
 * @param {object} order
 * @param {object} [brandPolicies]
 * @returns {{ allowed: boolean, eligible: boolean, reason: string | null, explanation: string, ruleCited: string }}
 */
export function canReportDamage(order, brandPolicies = DEFAULT_AURA_POLICIES) {
  const policies = resolvePolicies(order, brandPolicies);
  const damageHours = policies.damagedReportWindowHours || 48;
  const damageDaysLimit = Math.max(1, Math.round(damageHours / 24));

  if (!order || typeof order !== "object") {
    const explanation = "Invalid order details.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
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
      explanation: "Product has not been delivered yet. If out for delivery, the customer may refuse at doorstep.",
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
    const explanation = "Delivery confirmation date is missing or not yet recorded.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited: "DAMAGE_WINDOW: Delivery confirmation date is missing.",
    };
  }

  if (daysAgo <= damageDaysLimit) {
    const explanation = `Delivered ${daysAgo} day(s) ago (within the ${damageHours}-hour damage reporting window). Support ticket can be created.`;
    return {
      allowed: true,
      eligible: true,
      reason: null,
      explanation,
      ruleCited: `DAMAGE_WINDOW: damaged/defective reported within ${damageHours} hours of delivery.`,
    };
  }

  const reason = `DAMAGE_WINDOW: delivered ${daysAgo} days ago, damaged/defective must be reported within ${damageHours} hours of delivery`;
  const explanation = `Reporting window expired. Product was delivered ${daysAgo} days ago (exceeds ${damageHours}-hour limit for damage claims).`;
  return {
    allowed: false,
    eligible: false,
    reason,
    explanation,
    ruleCited: reason,
  };
}

/**
 * Check if an order is eligible for cancellation.
 *
 * @param {object} order
 * @param {object} [brandPolicies]
 * @returns {{ allowed: boolean, eligible: boolean, reason: string | null, explanation: string, ruleCited: string }}
 */
export function canCancel(order, brandPolicies = DEFAULT_AURA_POLICIES) {
  const policies = resolvePolicies(order, brandPolicies);
  const cancelHours = policies.cancelWindowHours || 4;

  if (!order || typeof order !== "object" || !order.status) {
    const explanation = "Invalid or missing order details.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited: "CANCEL_WINDOW: Invalid or missing order details.",
    };
  }

  const status = order.status;

  if (status === "Processing") {
    const hoursAgo = typeof order.placed_hours_ago === "number" ? order.placed_hours_ago : 0;
    const ruleCited = `CANCEL_WINDOW: status is Processing (${hoursAgo}h ago <= ${cancelHours}h window, cancellation allowed)`;
    const explanation = `Order is in Processing status within the ${cancelHours}-hour window and can be cancelled.`;
    return {
      allowed: true,
      eligible: true,
      reason: null,
      explanation,
      ruleCited,
    };
  }

  if (status === "Out for Delivery" || status === "Shipped") {
    const ruleCited = `CANCEL_WINDOW: status is ${status} (cannot cancel directly; doorstep refusal available)`;
    const explanation =
      "Order is already " +
      status.toLowerCase() +
      " and cannot be cancelled directly. The customer may refuse delivery at their doorstep.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited,
    };
  }

  if (status === "Delivered") {
    const ruleCited = "CANCEL_WINDOW: order is already Delivered";
    const explanation = "Order is already delivered and cannot be cancelled.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited,
    };
  }

  if (status === "Cancellation Requested") {
    const ruleCited = "CANCEL_WINDOW: cancellation already requested";
    const explanation = "Order is already Cancellation Requested.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited,
    };
  }

  const ruleCited = `CANCEL_WINDOW: order cannot be cancelled in status: ${status}`;
  const explanation = `Order cannot be cancelled in status: ${status}.`;
  return {
    allowed: false,
    eligible: false,
    reason: explanation,
    explanation,
    ruleCited,
  };
}

/**
 * Check if an order is eligible for return.
 *
 * @param {object} order
 * @param {object} [brandPolicies]
 * @returns {{ allowed: boolean, eligible: boolean, reason: string | null, explanation: string, ruleCited: string, requiresUnopenedUnusedOriginalPackaging: boolean, damagedDefectiveRule: string }}
 */
export function canReturn(order, brandPolicies = DEFAULT_AURA_POLICIES) {
  const policies = resolvePolicies(order, brandPolicies);
  const base = {
    requiresUnopenedUnusedOriginalPackaging: Boolean(policies.requiresUnopened),
    damagedDefectiveRule: policies.damagedRuleText || DAMAGED_DEFECTIVE_RULE,
  };

  if (!order || typeof order !== "object" || order.status !== "Delivered") {
    const currentStatus = order?.status || "Unknown";
    const ruleCited = `RETURN_WINDOW: status is "${currentStatus}" (only delivered orders are eligible for return)`;
    const explanation = `Only delivered orders are eligible for return. This order status is "${currentStatus}".`;
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited,
      ...base,
    };
  }

  // Brand Policy: Consumables / Perishable Food (e.g. Kaveri Coffee Roasters)
  if (policies.perishableConsumables || policies.returnWindowDays === 0) {
    const explanation =
      policies.returnNonReturnableReason ||
      "Freshly roasted coffee items are perishable consumable food items and cannot be returned after delivery for food safety reasons.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited: "RETURN_POLICY: perishable food items non-returnable once delivered",
      ...base,
    };
  }

  const daysAgo = typeof order.delivered_days_ago === "number" ? order.delivered_days_ago : null;

  if (daysAgo === null) {
    const ruleCited = "RETURN_WINDOW: delivery confirmation date missing";
    const explanation = "Delivery confirmation date is missing or not yet recorded.";
    return {
      allowed: false,
      eligible: false,
      reason: explanation,
      explanation,
      ruleCited,
      ...base,
    };
  }

  const returnLimit = policies.returnWindowDays || 7;

  if (daysAgo <= returnLimit) {
    const ruleCited = `RETURN_WINDOW: delivered ${daysAgo} days ago <= ${returnLimit}-day limit (unopened only)`;
    const explanation = `Order delivered ${daysAgo} day(s) ago, within the ${returnLimit}-day return window. Requires unopened/unused product in original packaging.`;
    return {
      allowed: true,
      eligible: true,
      reason: null,
      explanation,
      ruleCited,
      ...base,
    };
  }

  const ruleCited = `RETURN_WINDOW: delivered ${daysAgo} days ago > ${returnLimit}-day limit`;
  const explanation = `Return window expired. The order was delivered ${daysAgo} days ago, exceeding the ${returnLimit} days return policy limit.`;
  return {
    allowed: false,
    eligible: false,
    reason: explanation,
    explanation,
    ruleCited,
    ...base,
  };
}

/**
 * Calculate shipping fee for given cart/order value in INR.
 *
 * @param {number} value
 * @param {object} [brandPolicies]
 * @returns {{ fee: number, amount: number, allowed: boolean, ruleCited: string, explanation: string, reason: string, valueOf: () => number }}
 */
export function shippingFee(value, brandPolicies = DEFAULT_AURA_POLICIES) {
  const policies = brandPolicies || DEFAULT_AURA_POLICIES;
  const threshold = policies.freeShippingThreshold !== undefined ? policies.freeShippingThreshold : 499;
  const standardFee = policies.shippingFee !== undefined ? policies.shippingFee : 50;

  const numVal = Number(value) || 0;
  const isFree = numVal > threshold;
  const fee = isFree ? 0 : standardFee;
  const ruleCited = isFree
    ? `SHIPPING_POLICY: order value Rs ${numVal} > Rs ${threshold} (free shipping)`
    : `SHIPPING_POLICY: order value Rs ${numVal} <= Rs ${threshold} (Rs ${standardFee} shipping fee)`;
  const explanation = isFree
    ? `Free standard shipping applied as order value (Rs ${numVal}) exceeds Rs ${threshold}.`
    : `Standard shipping fee of Rs ${standardFee} applies for orders of Rs ${threshold} or below.`;

  return {
    fee,
    amount: fee,
    allowed: true,
    ruleCited,
    reason: explanation,
    explanation,
    valueOf: () => fee,
  };
}

/**
 * Determine if Cash on Delivery (COD) is available.
 *
 * @param {number} value
 * @param {object} [brandPolicies]
 * @returns {{ available: boolean, allowed: boolean, eligible: boolean, ruleCited: string, explanation: string, reason: string, valueOf: () => boolean }}
 */
export function codAvailable(value, brandPolicies = DEFAULT_AURA_POLICIES) {
  const policies = brandPolicies || DEFAULT_AURA_POLICIES;
  const maxLimit = policies.codMaxThreshold !== undefined ? policies.codMaxThreshold : 2500;

  const numVal = Number(value) || 0;
  const available = numVal <= maxLimit;
  const ruleCited = available
    ? `COD_POLICY: order value Rs ${numVal} <= Rs ${maxLimit} limit (COD available)`
    : `COD_POLICY: order value Rs ${numVal} > Rs ${maxLimit} limit (COD unavailable)`;
  const explanation = available
    ? `Cash on Delivery is available for orders up to Rs ${maxLimit.toLocaleString("en-IN")}.`
    : `Cash on Delivery is not available for orders above Rs ${maxLimit.toLocaleString("en-IN")}. Please use prepaid payment.`;

  return {
    available,
    allowed: available,
    eligible: available,
    ruleCited,
    reason: explanation,
    explanation,
    valueOf: () => available,
  };
}

