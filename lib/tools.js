/**
 * lib/tools.js — Tool implementations for Aria voice assistant
 *
 * Three core tools:
 * 1. getOrderDetails(orderId, sessionId)
 * 2. requestCancellation(orderId, sessionId)
 * 3. createSupportTicket({ orderId, category, description }, sessionId)
 */

import crypto from "crypto";
import {
  getOrderById,
  saveSessionOverride,
  deleteSessionOverrides,
  insertSupportTicket,
  saveCancelConfirmation,
  getCancelConfirmation,
  markCancelConfirmationUsed,
} from "./db.js";
import { canCancel, canReturn, canReportDamage, shippingFee, codAvailable } from "./policy.js";
import { getBrand, getBrandPolicies } from "./brands.js";

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
export function normalizeOrderId(input, activeBrand = "aura") {
  if (input === null || input === undefined) return null;

  let str = String(input).trim().toLowerCase();
  if (!str) return null;

  // Replace spoken word digits: "one zero one" -> "1 0 1"
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    str = str.replace(new RegExp(`\\b${word}\\b`, "gi"), digit);
  }

  // Replace spoken separators: "dash", "hyphen" -> "-"
  str = str.replace(/\b(dash|hyphen)\b/gi, "-");

  // Collapse spaces between individual letters/digits: "o r d" -> "ord", "k a v" -> "kav"
  str = str.replace(/\b([a-z0-9])\s+(?=[a-z0-9]\b)/gi, "$1");

  // Remove extra spaces around dashes: "ord - 101" -> "ord-101", "kav - 201" -> "kav-201"
  str = str.replace(/\s*-\s*/g, "-");

  // Check if explicitly Kaveri prefix: kav- or kaveri- or kav201
  const hasKav = /kav(?:eri)?/i.test(str);
  // Check if explicitly ORD prefix: ord- or ord101 (distinguish from the general word 'order')
  const hasOrd = /\bord(?:-|\d|\b(?!er))/i.test(str);

  if (hasKav) {
    const kavMatch = str.match(/kav(?:eri)?\s*[-]?\s*(\d{2,})/i);
    if (kavMatch && kavMatch[1]) {
      return `KAV-${kavMatch[1]}`;
    }
  }

  if (hasOrd) {
    const ordMatch = str.match(/\bord\s*[-]?\s*(\d{2,})/i);
    if (ordMatch && ordMatch[1]) {
      return `ORD-${ordMatch[1]}`;
    }
  }

  // If there's "order 101" or just "101", resolve prefix from activeBrand
  const digitsMatch = str.match(/(?:order)?\s*[-]?\s*(\d{2,})/i);
  if (digitsMatch && digitsMatch[1]) {
    const digits = digitsMatch[1];
    const isKaveriBrand = typeof activeBrand === "string" && activeBrand.toLowerCase() === "kaveri";
    const prefix = isKaveriBrand ? "KAV-" : "ORD-";
    return `${prefix}${digits}`;
  }

  return null;
}

/**
 * Tool 1: getOrderDetails
 *
 * Fetches order details with session overrides applied, evaluates policy eligibility,
 * and returns clean fields the agent needs.
 *
 * @param {string | object} orderId
 * @param {string} [sessionId="default-session"]
 * @param {string} [brandId="aura"]
 * @returns {Promise<{ found: true, order: any, eligibility: any } | { found: false, error: "MISSING_ORDER_ID" | "ORDER_NOT_FOUND", message: string }>}
 */
export async function getOrderDetails(orderId, sessionId = "default-session", brandId = "aura") {
  let actualOrderId = orderId;
  let actualSessionId = sessionId;
  let actualBrandId = brandId;

  if (typeof orderId === "object" && orderId !== null) {
    actualOrderId = orderId.orderId ?? orderId.order_id;
    actualSessionId = orderId.sessionId ?? orderId.session_id ?? sessionId;
    actualBrandId = orderId.brandId ?? orderId.brand_id ?? brandId;
  }

  actualBrandId = (actualBrandId || "aura").toLowerCase();
  const brand = getBrand(actualBrandId);
  const brandPolicies = getBrandPolicies(actualBrandId);

  const normalizedId = normalizeOrderId(actualOrderId, actualBrandId);

  if (!normalizedId) {
    return {
      found: false,
      error: "MISSING_ORDER_ID",
      message: `Please provide a valid order ID (e.g. ${brand.orders_prefix}${actualBrandId === "kaveri" ? "201" : "101"}).`,
    };
  }

  // Cross-brand refusal: if normalized ID prefix doesn't match active brand prefix
  // (e.g. looking up a KAV- ID while in Aura mode, or ORD- while in Kaveri mode)
  if (!normalizedId.startsWith(brand.orders_prefix)) {
    return {
      found: false,
      error: "ORDER_NOT_FOUND",
      message: `I couldn't locate order ${normalizedId} in our ${brand.name} system.`,
    };
  }

  const { order } = await getOrderById(normalizedId, actualSessionId, actualBrandId);

  if (!order) {
    return {
      found: false,
      error: "ORDER_NOT_FOUND",
      message: `I couldn't locate order ${normalizedId} in our ${brand.name} system. Please verify the order number and try again.`,
    };
  }

  const cancelResult = canCancel(order, brandPolicies);
  const returnResult = canReturn(order, brandPolicies);
  const damageResult = canReportDamage(order, brandPolicies);
  const shipping = shippingFee(order.value_inr, brandPolicies);
  const cod = codAvailable(order.value_inr, brandPolicies);

  // Return only fields the agent needs (clean shape)
  const cleanOrder = {
    order_id: order.order_id,
    brand_id: order.brand_id || actualBrandId,
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
    shippingFee: typeof shipping === "object" ? shipping.fee : shipping,
    codAvailable: typeof cod === "object" ? cod.available : cod,
    reasons: {
      cancel: cancelResult.reason,
      return: returnResult.reason,
      damage: damageResult.reason,
      shipping: shipping?.reason || shipping?.explanation,
      cod: cod?.reason || cod?.explanation,
    },
    rulesCited: {
      cancel: cancelResult.ruleCited,
      return: returnResult.ruleCited,
      damage: damageResult.ruleCited,
      shipping: shipping?.ruleCited,
      cod: cod?.ruleCited,
    },
    explanations: {
      cancel: cancelResult.explanation || cancelResult.reason,
      return: returnResult.explanation || returnResult.reason,
      damage: damageResult.explanation || damageResult.reason,
      shipping: shipping?.explanation,
      cod: cod?.explanation,
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
/**
 * Tool 2: requestCancellation (Two-Phase Enforced Server-Side)
 *
 * Requirements (Task 14):
 * - Phase 1 (default): {orderId} -> if eligible, returns {status:"CONFIRMATION_REQUIRED", confirmToken, message};
 *   stores a hashed, single-use token with a 2-minute expiry in cancel_confirmations(session_id, order_id, token_hash, expires_at).
 *   If ineligible, returns refusal with ruleCited.
 * - Phase 2: {orderId, confirmToken} -> validates token, session, expiry, single use, re-checks eligibility,
 *   then applies the override. Otherwise returns a clear error.
 *
 * @param {string | object} paramsOrOrderId - e.g. "ORD-103" or { orderId: "ORD-103", confirmToken: "..." }
 * @param {string} [sessionId="default-session"]
 * @param {string | null} [maybeToken=null]
 * @returns {Promise<{ success: boolean, status: string, order_id?: string, confirmToken?: string, error?: string, reason?: string, ruleCited?: string, message: string }>}
 */
export async function requestCancellation(paramsOrOrderId, sessionId = "default-session", maybeToken = null, brandId = "aura") {
  let orderId;
  let confirmToken = maybeToken;
  let isExplicitPhase2 = false;
  let actualBrandId = brandId;

  if (typeof paramsOrOrderId === "object" && paramsOrOrderId !== null) {
    orderId = paramsOrOrderId.orderId ?? paramsOrOrderId.order_id;
    confirmToken =
      "confirmToken" in paramsOrOrderId
        ? paramsOrOrderId.confirmToken
        : "confirm_token" in paramsOrOrderId
        ? paramsOrOrderId.confirm_token
        : maybeToken;
    sessionId = paramsOrOrderId.sessionId ?? paramsOrOrderId.session_id ?? sessionId;
    actualBrandId = paramsOrOrderId.brandId ?? paramsOrOrderId.brand_id ?? brandId;
    if (paramsOrOrderId.phase === 2 || paramsOrOrderId.phase === "2" || paramsOrOrderId.phase === "confirm") {
      isExplicitPhase2 = true;
    }
  } else {
    orderId = paramsOrOrderId;
  }

  actualBrandId = (actualBrandId || "aura").toLowerCase();
  const brand = getBrand(actualBrandId);
  const brandPolicies = getBrandPolicies(actualBrandId);

  // Sanitize input
  if (!orderId || (typeof orderId !== "string" && typeof orderId !== "number")) {
    return {
      success: false,
      status: "ERROR",
      error: "MISSING_ORDER_ID",
      message: "Please provide a valid order ID for cancellation.",
    };
  }

  const rawCleaned = String(orderId).replace(/[<>{}\\]/g, "").slice(0, 50).trim();
  const normalizedId = normalizeOrderId(rawCleaned, actualBrandId);

  if (!normalizedId) {
    return {
      success: false,
      status: "ERROR",
      error: "INVALID_ORDER_ID",
      message: `Please provide a valid order ID for cancellation (e.g. ${brand.orders_prefix}${actualBrandId === "kaveri" ? "203" : "103"}).`,
    };
  }

  // Cross-brand refusal: if normalized ID prefix doesn't match active brand prefix
  if (!normalizedId.startsWith(brand.orders_prefix)) {
    return {
      success: false,
      status: "NOT_FOUND",
      found: false,
      error: "ORDER_NOT_FOUND",
      message: `I couldn't locate order ${normalizedId} in our ${brand.name} system.`,
    };
  }

  const { order } = await getOrderById(normalizedId, sessionId, actualBrandId);

  if (!order) {
    return {
      success: false,
      status: "NOT_FOUND",
      found: false,
      error: "ORDER_NOT_FOUND",
      message: `I couldn't locate order ${normalizedId} in our ${brand.name} system.`,
    };
  }

  // Determine if this invocation is Phase 2
  const isPhase2 = isExplicitPhase2 || (confirmToken !== undefined && confirmToken !== null);

  // ── PHASE 2: Execution with Confirmation Token ─────────────────────
  if (isPhase2) {
    if (!confirmToken || typeof confirmToken !== "string" || !confirmToken.trim()) {
      return {
        success: false,
        status: "ERROR",
        error: "MISSING_CONFIRM_TOKEN",
        message: "Confirmation token is required to complete order cancellation (Phase 2).",
      };
    }

    const tokenHash = crypto.createHash("sha256").update(confirmToken.trim()).digest("hex");
    const record = await getCancelConfirmation(tokenHash);

    if (!record) {
      return {
        success: false,
        status: "ERROR",
        error: "INVALID_TOKEN",
        message: "Invalid or unknown cancellation confirmation token.",
      };
    }

    if (record.session_id !== sessionId) {
      return {
        success: false,
        status: "ERROR",
        error: "INVALID_SESSION",
        message: "Confirmation token belongs to a different session.",
      };
    }

    if (record.order_id !== normalizedId) {
      return {
        success: false,
        status: "ERROR",
        error: "ORDER_MISMATCH",
        message: `Confirmation token was issued for order ${record.order_id}, not ${normalizedId}.`,
      };
    }

    if (record.used) {
      return {
        success: false,
        status: "ERROR",
        error: "TOKEN_ALREADY_USED",
        message: "Confirmation token has already been used. Please request cancellation again.",
      };
    }

    const expiresAtTime = new Date(record.expires_at).getTime();
    if (Date.now() > expiresAtTime) {
      return {
        success: false,
        status: "ERROR",
        error: "TOKEN_EXPIRED",
        message: "Confirmation token has expired (valid for 2 minutes). Please request cancellation again.",
      };
    }

    // Re-check cancellation policy server-side
    const policyCheck = canCancel(order, brandPolicies);
    if (!policyCheck.allowed) {
      return {
        success: false,
        status: "REFUSED",
        error: "CANCELLATION_NOT_ALLOWED",
        reason: policyCheck.reason,
        explanation: policyCheck.explanation || policyCheck.reason,
        ruleCited: policyCheck.ruleCited,
        message: `Cancellation cannot be processed: ${policyCheck.reason}`,
      };
    }

    // Single-use: mark token as consumed
    await markCancelConfirmationUsed(tokenHash);

    // Apply session override
    await saveSessionOverride(sessionId, normalizedId, "Cancellation Requested");

    return {
      success: true,
      status: "CANCELLED",
      order_id: normalizedId,
      ruleCited: policyCheck.ruleCited,
      explanation: policyCheck.explanation || "Order cancellation processed successfully for eligible order.",
      message: `Order ${normalizedId} has been successfully cancelled.`,
    };
  }

  // ── PHASE 1 (Default): Eligibility Check & Token Issuance ──────────
  const policyCheck = canCancel(order, brandPolicies);
  if (!policyCheck.allowed) {
    return {
      success: false,
      status: "REFUSED",
      error: "CANCELLATION_NOT_ALLOWED",
      reason: policyCheck.reason,
      explanation: policyCheck.explanation || policyCheck.reason,
      ruleCited: policyCheck.ruleCited,
      message: `Cancellation cannot be processed: ${policyCheck.reason}`,
    };
  }

  // Generate secure single-use token with 2-minute expiry
  const rawToken = "aria_cnfp_" + crypto.randomBytes(16).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

  await saveCancelConfirmation({
    sessionId,
    orderId: normalizedId,
    tokenHash,
    expiresAt,
  });

  return {
    success: true,
    status: "CONFIRMATION_REQUIRED",
    order_id: normalizedId,
    confirmToken: rawToken,
    expiresAt: expiresAt.toISOString(),
    ruleCited: policyCheck.ruleCited,
    explanation: policyCheck.explanation || "Order is eligible for cancellation. Confirmation token issued.",
    message: `Cancellation for order ${normalizedId} requires explicit customer confirmation. Please ask the customer: "Shall I go ahead and cancel order ${normalizedId}?" and call Phase 2 with confirmToken once confirmed.`,
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
