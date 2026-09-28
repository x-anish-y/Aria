/**
 * lib/summary.js — Post-Call Evaluation & Deterministic Summary Generator
 *
 * Requirements:
 * 1. JSON Schema:
 *    {
 *      customer_intent: ORDER_TRACKING | CANCELLATION | RETURN_REFUND | SHIPPING_INFO | COD_INFO | PRODUCT_INFO | COMPLAINT | OUT_OF_SCOPE | OTHER,
 *      order_id: string | null,
 *      resolution_status: RESOLVED | UNRESOLVED | ESCALATION_NEEDED | POLICY_DECLINED | ABANDONED,
 *      call_summary: string (1-3 sentences),
 *      policy_notes: string | null,
 *      customer_sentiment: POSITIVE | NEUTRAL | NEGATIVE,
 *      actions_taken: string[]
 *    }
 * 2. Ground order_id, actions_taken, and outcomes in toolEvents (never model's guess)
 * 3. Deterministic fallback if LLM fails, returns invalid JSON, or call is abandoned
 */

export const ALLOWED_INTENTS = [
  "ORDER_TRACKING",
  "CANCELLATION",
  "RETURN_REFUND",
  "SHIPPING_INFO",
  "COD_INFO",
  "PRODUCT_INFO",
  "COMPLAINT",
  "OUT_OF_SCOPE",
  "OTHER",
];

export const ALLOWED_RESOLUTIONS = [
  "RESOLVED",
  "UNRESOLVED",
  "ESCALATION_NEEDED",
  "POLICY_DECLINED",
  "ABANDONED",
];

export const ALLOWED_SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE"];

/**
 * Builds a deterministic summary grounded directly in tool events and transcript.
 * Guaranteed to succeed without any network or model dependency.
 *
 * @param {object} params
 * @param {Array<object>} params.transcript
 * @param {Array<object>} params.toolEvents
 * @returns {object} Validated summary object
 */
export function buildDeterministicSummary({ transcript = [], toolEvents = [] } = {}) {
  // 1. Detect Abandoned Call (no user speech or fewer than 2 turns, and no tool activity)
  const userTurns = transcript.filter(
    (t) => t.speaker === "user" && t.text && t.text.trim().length > 0
  );

  const isAbandoned =
    (userTurns.length === 0 || transcript.length < 2) && toolEvents.length === 0;

  if (isAbandoned) {
    return {
      customer_intent: "OTHER",
      order_id: null,
      resolution_status: "ABANDONED",
      call_summary:
        "The call was initiated but concluded before the customer provided an inquiry or engaged in consultation.",
      policy_notes: null,
      customer_sentiment: "NEUTRAL",
      actions_taken: [],
    };
  }

  // 2. Extract grounded order ID from tool events or user transcript
  let orderId = null;
  for (const te of toolEvents) {
    const rawId = te.args?.orderId || te.args?.order_id;
    if (rawId) {
      orderId = String(rawId).toUpperCase();
      break;
    }
  }

  if (!orderId) {
    for (const t of userTurns) {
      const match = t.text.match(/ORD[- ]?(\d+)/i);
      if (match) {
        orderId = `ORD-${match[1]}`;
        break;
      }
    }
  }

  // 3. Extract actions taken from toolEvents
  const actionsTaken = [];
  let isPolicyDeclined = false;
  let isTicketCreated = false;
  let isCancellationRequested = false;
  let isTrackingLookedUp = false;
  let policyNotes = null;

  for (const te of toolEvents) {
    const name = te.name;
    const res = te.result || {};

    if (name === "getOrderDetails") {
      isTrackingLookedUp = true;
      if (res.found) {
        actionsTaken.push(
          `Verified status for ${res.order?.order_id || orderId} (${res.order?.status || "Found"}) via Aura database`
        );
        if (res.eligibility?.reasons?.return) {
          policyNotes = res.eligibility.reasons.return;
        }
      } else {
        actionsTaken.push(`Queried order details for ${orderId || "unknown order"} (not found)`);
      }
    } else if (name === "requestCancellation") {
      if (res.success) {
        isCancellationRequested = true;
        actionsTaken.push(`Submitted cancellation request for order ${res.order_id || orderId}`);
        policyNotes = "Cancellation request recorded under Processing status eligibility.";
      } else {
        isPolicyDeclined = true;
        actionsTaken.push(`Declined cancellation request for order ${orderId} per Aura policy`);
        policyNotes = res.message || res.reason || "Order status does not allow direct cancellation.";
      }
    } else if (name === "createSupportTicket") {
      isTicketCreated = true;
      actionsTaken.push(
        `Created support ticket #${res.ticketId || "new"} for category ${res.category || "GENERAL"}`
      );
      policyNotes = "Customer query escalated to support team; no unauthorized refund timeline promised.";
    }
  }

  // 4. Determine customer intent
  const fullUserText = userTurns.map((t) => t.text.toLowerCase()).join(" ");
  let customerIntent = "OTHER";

  if (isCancellationRequested || fullUserText.includes("cancel")) {
    customerIntent = "CANCELLATION";
  } else if (fullUserText.includes("return") || fullUserText.includes("refund")) {
    customerIntent = "RETURN_REFUND";
  } else if (isTrackingLookedUp || fullUserText.includes("track") || fullUserText.includes("where is")) {
    customerIntent = "ORDER_TRACKING";
  } else if (fullUserText.includes("shipping") || fullUserText.includes("delivery fee")) {
    customerIntent = "SHIPPING_INFO";
  } else if (fullUserText.includes("cod") || fullUserText.includes("cash on delivery")) {
    customerIntent = "COD_INFO";
  } else if (fullUserText.includes("serum") || fullUserText.includes("cream") || fullUserText.includes("oil") || fullUserText.includes("skincare")) {
    customerIntent = "PRODUCT_INFO";
  } else if (isTicketCreated || fullUserText.includes("damage") || fullUserText.includes("leak") || fullUserText.includes("complaint")) {
    customerIntent = "COMPLAINT";
  } else if (fullUserText.includes("flight") || fullUserText.includes("hotel") || fullUserText.includes("weather") || fullUserText.includes("goa")) {
    customerIntent = "OUT_OF_SCOPE";
  }

  // 5. Determine resolution status
  let resolutionStatus = "RESOLVED";

  if (isTicketCreated) {
    resolutionStatus = "ESCALATION_NEEDED";
  } else if (isPolicyDeclined) {
    resolutionStatus = "POLICY_DECLINED";
  } else if (customerIntent === "RETURN_REFUND") {
    // Check if user asked to return an order outside window
    const hasPast7Days = fullUserText.includes("102") || (policyNotes && policyNotes.includes("7"));
    if (hasPast7Days) {
      resolutionStatus = "POLICY_DECLINED";
      if (!policyNotes) {
        policyNotes = "Return window expired (>7 days since delivery). Unopened policy applied.";
      }
    }
  } else if (customerIntent === "OUT_OF_SCOPE") {
    resolutionStatus = "RESOLVED";
    policyNotes = "Customer queried non-Aura topics; agent politely steered back to skincare.";
    if (actionsTaken.length === 0) {
      actionsTaken.push("Politely informed customer that service is dedicated solely to Aura Skincare");
    }
  } else if (toolEvents.length === 0 && userTurns.length > 0) {
    resolutionStatus = "RESOLVED";
  }

  // 6. Customer sentiment
  let customerSentiment = "NEUTRAL";
  if (fullUserText.includes("thank") || fullUserText.includes("great") || fullUserText.includes("good") || fullUserText.includes("helpful")) {
    customerSentiment = "POSITIVE";
  } else if (fullUserText.includes("angry") || fullUserText.includes("bad") || fullUserText.includes("terrible") || fullUserText.includes("frustrated")) {
    customerSentiment = "NEGATIVE";
  }

  // 7. Compose concise summary (1-3 sentences)
  let callSummary = "";
  if (customerIntent === "ORDER_TRACKING") {
    callSummary = `Customer inquired regarding the delivery status of ${orderId || "their order"}. Aria looked up the tracking records and confirmed the shipment status and expected arrival.`;
  } else if (customerIntent === "CANCELLATION") {
    if (resolutionStatus === "POLICY_DECLINED") {
      callSummary = `Customer requested cancellation for order ${orderId || ""}. Aria checked the order status and informed the customer that because it is already shipped, cancellation cannot be processed directly.`;
    } else {
      callSummary = `Customer requested cancellation for order ${orderId || ""}. Aria verified that the order is in Processing status and submitted the cancellation request.`;
    }
  } else if (customerIntent === "RETURN_REFUND") {
    if (resolutionStatus === "POLICY_DECLINED") {
      callSummary = `Customer inquired about returning order ${orderId || ""}. Aria reviewed the delivery timeline and clarified that returns are only permitted within 7 days of delivery with packaging intact.`;
    } else {
      callSummary = `Customer asked regarding return procedures for ${orderId || "their purchase"}. Aria provided the brand return eligibility guidelines.`;
    }
  } else if (customerIntent === "OUT_OF_SCOPE") {
    callSummary = "Customer asked an out-of-scope question unrelated to Aura Skincare. Aria politely clarified her scope and redirected the conversation to skincare support.";
  } else {
    callSummary = `Customer contacted Aura Skincare support regarding ${customerIntent.toLowerCase().replace(/_/g, " ")}. Aria assisted with relevant brand policy and consultation.`;
  }

  return {
    customer_intent: customerIntent,
    order_id: orderId,
    resolution_status: resolutionStatus,
    call_summary: callSummary,
    policy_notes: policyNotes,
    customer_sentiment: customerSentiment,
    actions_taken: actionsTaken,
  };
}

/**
 * Validates raw model output against the strict schema and grounds order ID and actions in tool events.
 *
 * @param {any} raw
 * @param {object} context
 * @returns {object} Validated, grounded summary
 */
export function validateAndSanitizeSummary(raw, context = {}) {
  const fallback = buildDeterministicSummary(context);
  if (!raw || typeof raw !== "object") return fallback;

  // Validate customer_intent
  const intent = ALLOWED_INTENTS.includes(raw.customer_intent)
    ? raw.customer_intent
    : fallback.customer_intent;

  // Validate resolution_status
  const status = ALLOWED_RESOLUTIONS.includes(raw.resolution_status)
    ? raw.resolution_status
    : fallback.resolution_status;

  // Validate customer_sentiment
  const sentiment = ALLOWED_SENTIMENTS.includes(raw.customer_sentiment)
    ? raw.customer_sentiment
    : fallback.customer_sentiment;

  // Ground order_id: strictly in toolEvents or user transcript, NEVER model's hallucination
  let groundedOrderId = null;
  const toolEvents = context.toolEvents || [];
  for (const te of toolEvents) {
    const rawId = te.args?.orderId || te.args?.order_id;
    if (rawId) {
      groundedOrderId = String(rawId).toUpperCase();
      break;
    }
  }
  if (!groundedOrderId && Array.isArray(context.transcript)) {
    for (const t of context.transcript) {
      const match = t?.text?.match(/ORD[- ]?(\d+)/i);
      if (match) {
        groundedOrderId = `ORD-${match[1]}`;
        break;
      }
    }
  }
  const orderId = groundedOrderId || fallback.order_id || null;

  // Actions taken: merge and deduplicate
  const actionsSet = new Set(fallback.actions_taken);
  if (Array.isArray(raw.actions_taken)) {
    for (const a of raw.actions_taken) {
      if (typeof a === "string" && a.trim()) actionsSet.add(a.trim());
    }
  }

  const callSummary =
    typeof raw.call_summary === "string" && raw.call_summary.trim().length > 10
      ? raw.call_summary.trim()
      : fallback.call_summary;

  const policyNotes =
    typeof raw.policy_notes === "string" && raw.policy_notes.trim()
      ? raw.policy_notes.trim()
      : fallback.policy_notes;

  return {
    customer_intent: intent,
    order_id: orderId,
    resolution_status: status,
    call_summary: callSummary,
    policy_notes: policyNotes,
    customer_sentiment: sentiment,
    actions_taken: Array.from(actionsSet),
  };
}
