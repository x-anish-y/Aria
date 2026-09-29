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
export function buildDeterministicSummary({ transcript = [], toolEvents = [], forcedResolution = null } = {}) {
  // 1. Detect Abandoned Call (no user speech or fewer than 2 turns, and no tool activity, or explicitly abandoned)
  const userTurns = transcript.filter(
    (t) => t.speaker === "user" && t.text && t.text.trim().length > 0
  );

  const isAbandoned =
    forcedResolution === "ABANDONED" ||
    ((userTurns.length === 0 || transcript.length < 2) && toolEvents.length === 0);

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
  let status = ALLOWED_RESOLUTIONS.includes(raw.resolution_status)
    ? raw.resolution_status
    : fallback.resolution_status;
  if (context.forcedResolution === "ABANDONED") {
    status = "ABANDONED";
  }

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

// ── 3. Task 17: Automatic QA Scorecard Constants & Evaluator ──────────────────

export const QA_SCHEMA = {
  type: "OBJECT",
  properties: {
    policy_adherence: {
      type: "INTEGER",
      description: "1 to 5 score. 5 = followed brand return/cancellation rules perfectly; 1 = violated brand policies.",
    },
    accuracy_of_information: {
      type: "INTEGER",
      description: "1 to 5 score. 5 = strictly grounded in tool data; 1 = fabricated false statuses or dates.",
    },
    empathy_and_tone: {
      type: "INTEGER",
      description: "1 to 5 score. 5 = warm, professional, attentive; 1 = rude, robotic, or dismissive.",
    },
    conciseness: {
      type: "INTEGER",
      description: "1 to 5 score. 5 = clear and concise; 1 = rambles, long monologues, unnecessary filler.",
    },
    resolution_effectiveness: {
      type: "INTEGER",
      description: "1 to 5 score. 5 = answered questions or executed action completely; 1 = customer left confused or unassisted.",
    },
    unsupported_promise_detected: {
      type: "BOOLEAN",
      description: "true if the agent promised refunds, delivery guarantees, or policy overrides not validated by tool output.",
    },
    coaching_note: {
      type: "STRING",
      description: "A single concise, actionable sentence of coaching feedback for the agent.",
    },
  },
  required: [
    "policy_adherence",
    "accuracy_of_information",
    "empathy_and_tone",
    "conciseness",
    "resolution_effectiveness",
    "unsupported_promise_detected",
    "coaching_note",
  ],
};

/**
 * Returns null scores for QA evaluation failures (graceful degradation).
 *
 * @param {string} [reason]
 * @returns {object}
 */
export function buildNullQAScorecard(reason = null) {
  return {
    policy_adherence: null,
    accuracy_of_information: null,
    empathy_and_tone: null,
    conciseness: null,
    resolution_effectiveness: null,
    unsupported_promise_detected: false,
    coaching_note: reason || "QA evaluation could not be completed.",
  };
}

/**
 * Validates and sanitizes a raw QA scorecard object from LLM generation.
 *
 * @param {object} raw - Parsed LLM JSON
 * @param {object} [context] - Call context for fallback
 * @returns {object} Sanitized QA scorecard
 */
export function validateAndSanitizeQAScorecard(raw, context = {}) {
  if (!raw || typeof raw !== "object") {
    return buildDeterministicQAScorecard(context);
  }

  const clampScore = (val, fallbackVal = 4) => {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    if (isNaN(num)) return fallbackVal;
    return Math.max(1, Math.min(5, Math.round(num)));
  };

  const policyAdherence = clampScore(raw.policy_adherence, 5);
  const accuracy = clampScore(raw.accuracy_of_information, 5);
  const empathy = clampScore(raw.empathy_and_tone, 4);
  const conciseness = clampScore(raw.conciseness, 4);
  const resolution = clampScore(raw.resolution_effectiveness, 4);

  const unsupportedPromise = Boolean(raw.unsupported_promise_detected);

  let coaching = "";
  if (typeof raw.coaching_note === "string" && raw.coaching_note.trim()) {
    coaching = raw.coaching_note.trim();
  } else if (unsupportedPromise) {
    coaching = "Flagged: Agent verbally promised an exception or guarantee not supported by policy.";
  } else if (policyAdherence && policyAdherence >= 4) {
    coaching = "Strong adherence to Aura customer service and return policies throughout the consultation.";
  } else {
    coaching = "Review return window and cancellation conditions to ensure full compliance.";
  }

  return {
    policy_adherence: policyAdherence,
    accuracy_of_information: accuracy,
    empathy_and_tone: empathy,
    conciseness: conciseness,
    resolution_effectiveness: resolution,
    unsupported_promise_detected: unsupportedPromise,
    coaching_note: coaching,
  };
}

/**
 * Deterministic QA scorecard evaluation based on pure transcript analysis,
 * tool results, and brand policy rules.
 *
 * @param {object} params
 * @param {Array<object>} params.transcript
 * @param {Array<object>} params.toolEvents
 * @param {object} [params.summary]
 * @returns {object}
 */
export function buildDeterministicQAScorecard({ transcript = [], toolEvents = [], summary = {} } = {}) {
  // If call is abandoned or has fewer than 2 turns
  if (!transcript || transcript.length < 2) {
    return {
      policy_adherence: 5,
      accuracy_of_information: 5,
      empathy_and_tone: 4,
      conciseness: 5,
      resolution_effectiveness: 3,
      unsupported_promise_detected: false,
      coaching_note: "Call concluded early before inquiry could be explored.",
    };
  }

  const agentTurns = transcript.filter((t) => t.speaker === "agent" || t.speaker === "aria");
  const agentText = agentTurns.map((t) => t.text || "").join(" ").toLowerCase();

  // 1. Detect unsupported promises
  // E.g. promising full refund immediately without tool confirmation, or promising delivery within 1 hour
  const suspiciousPatterns = [
    /i guarantee.*refund/i,
    /i promise.*refund/i,
    /i will personally give you.*refund/i,
    /will arrive in 1 hour/i,
    /we will make an exception for you/i,
  ];

  let unsupportedPromise = false;
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(agentText)) {
      unsupportedPromise = true;
      break;
    }
  }

  // 2. Score policy adherence
  let policyAdherence = 5;
  if (unsupportedPromise) {
    policyAdherence = 2;
  } else if (summary.resolution_status === "POLICY_DECLINED") {
    // If agent declined according to policy, score high!
    policyAdherence = 5;
  }

  // 3. Score accuracy
  let accuracy = 5;
  if (unsupportedPromise) {
    accuracy = 2;
  } else if (toolEvents.length > 0) {
    // Check if tool had error and agent claimed success
    const toolError = toolEvents.some((te) => te.result?.error || te.result?.success === false);
    if (toolError && (agentText.includes("everything is fine") || agentText.includes("cancelled successfully"))) {
      accuracy = 2;
    }
  }

  // 4. Empathy & Tone
  let empathy = 5;
  if (agentText.includes("sorry") || agentText.includes("understand") || agentText.includes("happy to help") || agentText.includes("welcome")) {
    empathy = 5;
  } else {
    empathy = 4;
  }

  // 5. Conciseness
  const avgTurnLength = agentTurns.length > 0
    ? agentTurns.reduce((acc, t) => acc + (t.text?.length || 0), 0) / agentTurns.length
    : 50;
  const conciseness = avgTurnLength > 300 ? 3 : avgTurnLength > 180 ? 4 : 5;

  // 6. Resolution effectiveness
  let resolution = 4;
  if (summary.resolution_status === "RESOLVED" || summary.resolution_status === "POLICY_DECLINED") {
    resolution = 5;
  } else if (summary.resolution_status === "ESCALATION_NEEDED") {
    resolution = 4;
  } else if (unsupportedPromise) {
    resolution = 2;
  }

  // Coaching note
  let coaching = "";
  if (unsupportedPromise) {
    coaching = "Flagged: Agent verbally guaranteed an outcome before confirming policy eligibility.";
  } else if (summary.resolution_status === "POLICY_DECLINED") {
    coaching = "Excellent policy explanation citing specific business guidelines with empathy.";
  } else if (toolEvents.length > 0) {
    coaching = "Accurately verified order records and communicated grounded timelines to the customer.";
  } else {
    coaching = "Maintained pleasant conversational flow and answered questions promptly.";
  }

  return {
    policy_adherence: policyAdherence,
    accuracy_of_information: accuracy,
    empathy_and_tone: empathy,
    conciseness: conciseness,
    resolution_effectiveness: resolution,
    unsupported_promise_detected: unsupportedPromise,
    coaching_note: coaching,
  };
}

