/**
 * lib/tools.js — Tool implementations for Aria voice assistant
 *
 * Three core tools:
 * 1. getOrderDetails(orderId, sessionId)
 * 2. requestCancellation(orderId, sessionId)
 * 3. createSupportTicket({ orderId, category, description }, sessionId)
 */

import {
  getOrderById,
  saveSessionOverride,
  deleteSessionOverrides,
  insertSupportTicket,
} from "./db.js";
import { canCancel, canReturn, canReportDamage, shippingFee, codAvailable } from "./policy.js";

/**
 * Word to digit mapping for normalizing spoken digits
 */
const WORD_TO_DIGIT = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/**
 * Normalizes user/spoken order ID strings into canonical format (e.g. "ORD-101").
 *
 * Examples:
 * - "ord 101" -> "ORD-101"
 * - "ORD101" -> "ORD-101"
 * - "101" -> "ORD-101"
 * - "O R D dash one zero one" -> "ORD-101"
 * - "order one zero two" -> "ORD-102"
 * - "ord-103" -> "ORD-103"
 *
 * @param {string | number | any} input
 * @returns {string | null} Canonical order ID (e.g. "ORD-101") or null if invalid
 */
export function normalizeOrderId(input) {
  if (input === null || input === undefined) return null;

  let str = String(input).trim().toLowerCase();
  if (!str) return null;

  // Replace spoken word digits: "one zero one" -> "1 0 1"
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    str = str.replace(new RegExp(`\\b${word}\\b`, "gi"), digit);
  }

  // Replace spoken separators: "dash", "hyphen" -> "-"
  str = str.replace(/\b(dash|hyphen)\b/gi, "-");

  // Collapse spaces between individual letters/digits: "o r d" -> "ord", "1 0 1" -> "101"
  str = str.replace(/\b([a-z0-9])\s+(?=[a-z0-9]\b)/gi, "$1");

  // Remove extra spaces around dashes: "ord - 101" -> "ord-101"
  str = str.replace(/\s*-\s*/g, "-");

  // Match pattern: optional (ord|order), optional dash, and 3+ digits
  const match = str.match(/(?:ord|order)?\s*[-]?\s*(\d{3,})/i);
  if (match && match[1]) {
    return `ORD-${match[1]}`;
  }

  // If already matches exact pattern like ORD-101
  const directMatch = str.match(/ord-(\d+)/i);
  if (directMatch && directMatch[1]) {
    return `ORD-${directMatch[1]}`;
  }

  return null;
}

/**
 * Tool 1: getOrderDetails
 *
 * Fetches order details with session overrides applied, evaluates policy eligibility,
 * and returns clean fields the agent needs.
 *
 * @param {string} orderId
 * @param {string} [sessionId="default-session"]
 * @returns {Promise<{ found: true, order: any, eligibility: any } | { found: false, error: "MISSING_ORDER_ID" | "ORDER_NOT_FOUND", message: string }>}
 */
export async function getOrderDetails(orderId, sessionId = "default-session") {
  const normalizedId = normalizeOrderId(orderId);

  if (!normalizedId) {
    return {
      found: false,
      error: "MISSING_ORDER_ID",
      message: "Please provide a valid order ID (e.g. ORD-101, ORD-102, or ORD-103).",
    };
  }

  const { order } = await getOrderById(normalizedId, sessionId);

  if (!order) {
    return {
      found: false,
      error: "ORDER_NOT_FOUND",
      message: `Order ${normalizedId} was not found. Please verify the order number and try again.`,
    };
  }

  const cancelResult = canCancel(order);
  const returnResult = canReturn(order);
  const damageResult = canReportDamage(order);
  const shipping = shippingFee(order.value_inr);
  const cod = codAvailable(order.value_inr);

  // Return only fields the agent needs (clean shape)
  const cleanOrder = {
    order_id: order.order_id,
    customer_name: order.customer_name,
    product: order.product,
    value_inr: order.value_inr,
    status: order.status,
    courier: order.courier,
    tracking_id: order.tracking_id,
    delivered_days_ago: order.delivered_days_ago,
    placed_hours_ago: order.placed_hours_ago,
    expected_delivery: order.expected_delivery,
  };

  const eligibility = {
    canCancel: cancelResult.allowed,
    canReturn: returnResult.allowed,
    canReportDamage: damageResult.allowed,
    shippingFee: shipping,
    codAvailable: cod,
    reasons: {
      cancel: cancelResult.reason,
      return: returnResult.reason,
      damage: damageResult.reason,
    },
    damageRuleCited: damageResult.ruleCited,
    requiresUnopenedUnusedOriginalPackaging: returnResult.requiresUnopenedUnusedOriginalPackaging,
    damagedDefectiveRule: returnResult.damagedDefectiveRule,
  };

  return {
    found: true,
    order: cleanOrder,
    eligibility,
  };
}

/**
 * Tool 2: requestCancellation
 *
 * Server-side guards:
 * - Sanitizes orderId input (strips control characters, caps length, normalizes)
 * - Re-evaluates cancellation policy server-side
 * - Returns only necessary fields
 *
 * @param {string} orderId
 * @param {string} [sessionId="default-session"]
 * @returns {Promise<{ success: boolean, order_id?: string, status?: string, error?: string, reason?: string, message: string }>}
 */
export async function requestCancellation(orderId, sessionId = "default-session") {
  // Sanitize input
  if (!orderId || typeof orderId !== "string" && typeof orderId !== "number") {
    return {
      success: false,
      error: "MISSING_ORDER_ID",
      message: "Please provide a valid order ID for cancellation.",
    };
  }

  const rawCleaned = String(orderId).replace(/[<>{}\\]/g, "").slice(0, 50).trim();
  const normalizedId = normalizeOrderId(rawCleaned);

  if (!normalizedId) {
    return {
      success: false,
      error: "INVALID_ORDER_ID",
      message: "Please provide a valid order ID for cancellation (e.g. ORD-103).",
    };
  }

  const { order } = await getOrderById(normalizedId, sessionId);

  if (!order) {
    return {
      success: false,
      error: "ORDER_NOT_FOUND",
      message: `Order ${normalizedId} was not found in our records.`,
    };
  }

  // Re-check cancellation policy server-side (never trust model)
  const policyCheck = canCancel(order);
  if (!policyCheck.allowed) {
    return {
      success: false,
      error: "CANCELLATION_NOT_ALLOWED",
      reason: policyCheck.reason,
      message: `Cancellation cannot be processed: ${policyCheck.reason}`,
    };
  }

  // Persist session override
  await saveSessionOverride(sessionId, normalizedId, "Cancellation Requested");

  return {
    success: true,
    order_id: normalizedId,
    status: "Cancellation Requested",
    message: `Cancellation request submitted successfully for order ${normalizedId}.`,
  };
}

/**
 * Tool 3: createSupportTicket
 *
 * Server-side guards:
 * - Sanitizes description (strips HTML/scripts, clamps length to 500 chars)
 * - Validates category against strict whitelist
 * - Normalizes orderId if present
 * - Returns only necessary fields (ticketId, category, message)
 *
 * @param {{ orderId?: string | null, category?: string, description?: string }} params
 * @param {string} [sessionId="default-session"]
 * @returns {Promise<{ success: boolean, ticketId: string | number, category: string, message: string }>}
 */
export async function createSupportTicket(params = {}, sessionId = "default-session") {
  const validCategories = ["DAMAGED_DEFECTIVE", "DELIVERY_ISSUE", "OTHER"];
  const rawCat = String(params?.category || "").toUpperCase().trim();
  const category = validCategories.includes(rawCat) ? rawCat : "OTHER";

  // Sanitize orderId
  let normalizedOrderId = null;
  if (params?.orderId) {
    const cleanOrderIdStr = String(params.orderId).replace(/[<>{}\\]/g, "").slice(0, 50).trim();
    normalizedOrderId = normalizeOrderId(cleanOrderIdStr);
  }

  // Sanitize description
  const rawDesc = String(params?.description || "Customer support request");
  const sanitizedDesc = rawDesc
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[^\x20-\x7E\u00A0-\u024F\u0900-\u097F.,?!'"()\-]/g, "") // remove control chars
    .trim()
    .slice(0, 500) || "Customer support inquiry";

  const { ticketId } = await insertSupportTicket({
    sessionId,
    orderId: normalizedOrderId,
    category,
    description: sanitizedDesc,
  });

  return {
    success: true,
    ticketId,
    category,
    message: `Support ticket #${ticketId} created successfully. Our customer support team has received your request and will review it shortly.`,
  };
}

/**
 * Clear overrides for a session
 * @param {string} sessionId
 */
export async function clearSessionOverrides(sessionId) {
  return deleteSessionOverrides(sessionId);
}
