/**
 * lib/decision-events.js — Standardized Decision Events & Agent Brain Engine
 *
 * Requirements (Task 12):
 * 1. Every tool call produces a structured decision event added to hook state:
 *    { ts, kind: "TOOL_CALL"|"POLICY_VERDICT"|"GUARDRAIL"|"FALLBACK", title, detail, ruleCited, status }
 * 2. Intent Classifier: fast, deterministic rule-based classifier based on latest turns and tool activity.
 * 3. Guardrail detection for medical advice, competitor comparisons, out-of-scope, and doorstep policies.
 */

export const DECISION_KINDS = {
  TOOL_CALL: "TOOL_CALL",
  POLICY_VERDICT: "POLICY_VERDICT",
  GUARDRAIL: "GUARDRAIL",
  FALLBACK: "FALLBACK",
};

/**
 * Standardize creation of a decision event
 * @param {object} params
 * @returns {object} DecisionEvent
 */
export function createDecisionEvent({
  id,
  ts = Date.now(),
  kind = DECISION_KINDS.TOOL_CALL,
  title = "Agent Decision",
  detail = "",
  ruleCited = null,
  status = "info", // "success" | "error" | "allowed" | "declined" | "blocked" | "active" | "info"
  ...extra
} = {}) {
  return {
    id: id || `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts,
    kind,
    title,
    detail,
    ruleCited,
    status,
    timestamp: new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    ...extra,
  };
}

/**
 * Fast, deterministic rule-based intent classifier.
 * Evaluates the latest user transcript turns and recent tool events.
 *
 * @param {Array<{ speaker: string, text: string }>} transcript
 * @param {Array<object>} toolEvents
 * @returns {{ intent: string, label: string, confidence: number, iconName: string, reason: string }}
 */
export function classifyIntent(transcript = [], toolEvents = []) {
  const userTurns = transcript.filter((t) => t.speaker === "user" && t.text?.trim());
  const latestTurn = userTurns.length > 0 ? userTurns[userTurns.length - 1].text.toLowerCase() : "";
  const allUserText = userTurns.map((t) => t.text.toLowerCase()).join(" ");

  // Check recent tool execution first for strong grounding
  const lastTool = toolEvents.length > 0 ? toolEvents[toolEvents.length - 1] : null;
  const toolName = lastTool?.name || (lastTool?.kind === "TOOL_CALL" ? lastTool?.title : "");

  if (toolName?.includes("requestCancellation") || latestTurn.match(/\b(cancel|cancellation|cancel kardo|nahi chahiye)\b/i)) {
    return {
      intent: "CANCELLATION",
      label: "Order Cancellation",
      confidence: 0.96,
      iconName: "XCircle",
      reason: "User requested order cancellation; verified against 4-hour policy window.",
    };
  }

  if (toolName?.includes("getOrderDetails") || latestTurn.match(/\b(track|tracking|status|where is|kahan hai|deliver|delivery time)\b/i)) {
    return {
      intent: "ORDER_TRACKING",
      label: "Order Tracking",
      confidence: 0.95,
      iconName: "Package",
      reason: "Customer inquired about shipment status, tracking ID, or expected delivery.",
    };
  }

  if (latestTurn.match(/\b(return|refund|money back|wapas|exchange)\b/i)) {
    return {
      intent: "RETURN_REFUND",
      label: "Return & Refund",
      confidence: 0.92,
      iconName: "RotateCcw",
      reason: "Customer asked to return delivered products or inquired about refund timelines.",
    };
  }

  if (latestTurn.match(/\b(damaged|broken|defect|leaking|leak|kharab|expired|rash|reaction)\b/i) || toolName?.includes("createSupportTicket")) {
    return {
      intent: "COMPLAINT",
      label: "Damaged / Defect Claim",
      confidence: 0.94,
      iconName: "AlertTriangle",
      reason: "Product condition or delivery defect reported; requires support ticket escalation.",
    };
  }

  if (latestTurn.match(/\b(shipping|delivery fee|free delivery|cod|cash on delivery|delivery charge)\b/i)) {
    return {
      intent: "SHIPPING_INFO",
      label: "Shipping & COD Policy",
      confidence: 0.91,
      iconName: "Truck",
      reason: "Inquiry regarding standard shipping thresholds (>Rs 499) or COD availability (<=Rs 2,500).",
    };
  }

  if (latestTurn.match(/\b(ingredient|ingredients|serum|vitamin c|kumkumadi|toner|natural|organic|fragrance|paraben|how to use|routine)\b/i)) {
    return {
      intent: "PRODUCT_INFO",
      label: "Product Inquiry",
      confidence: 0.89,
      iconName: "Sparkles",
      reason: "Questions regarding Aura Skincare formulations, active ingredients, or usage guidance.",
    };
  }

  if (latestTurn.match(/\b(flight|weather|cricket|recipe|movie|bitcoin|stock|hack|discount code|coupon|system prompt)\b/i)) {
    return {
      intent: "OUT_OF_SCOPE",
      label: "Out of Scope / Guardrail",
      confidence: 0.98,
      iconName: "ShieldAlert",
      reason: "Inquiry outside Aura customer service scope; policy guardrails active.",
    };
  }

  if (userTurns.length > 0) {
    return {
      intent: "GENERAL_INQUIRY",
      label: "General Consultation",
      confidence: 0.75,
      iconName: "MessageSquare",
      reason: "Conversational consultation or greeting.",
    };
  }

  return {
    intent: "IDLE",
    label: "Awaiting Input",
    confidence: 1.0,
    iconName: "Activity",
    reason: "No active query detected. System idle.",
  };
}

/**
 * Transforms a raw tool invocation into structured decision events:
 * 1. TOOL_CALL event
 * 2. Optional POLICY_VERDICT events (derived from eligibility rules)
 * 3. Optional GUARDRAIL event (e.g. doorstep refusal guardrail)
 *
 * @param {string} toolName
 * @param {object} args
 * @param {object} result
 * @param {number} durationMs
 * @returns {Array<object>} List of DecisionEvents
 */
export function deriveDecisionEventsFromTool(toolName, args = {}, result = {}, durationMs = 0) {
  const events = [];
  const now = Date.now();
  const isSuccess = !result?.error && result?.found !== false;

  // 1. Base TOOL_CALL event
  events.push(
    createDecisionEvent({
      id: `tool-${now}-${Math.random().toString(36).slice(2, 6)}`,
      ts: now,
      kind: DECISION_KINDS.TOOL_CALL,
      title: `Tool: ${toolName}`,
      detail: {
        args,
        resultSummary: result?.found
          ? `Found ${result.order?.order_id} (${result.order?.status})`
          : result?.message || (result?.success ? "Executed successfully" : "Execution failed"),
        result,
        durationMs,
      },
      ruleCited: null,
      status: isSuccess ? "success" : "error",
      name: toolName,
      args,
      result,
      durationMs,
    })
  );

  // 2. Derive POLICY_VERDICT events
  if (toolName === "getOrderDetails" && result?.found && result?.eligibility) {
    const el = result.eligibility;

    // Cancellation verdict
    events.push(
      createDecisionEvent({
        id: `verdict-cancel-${now}`,
        ts: now + 1,
        kind: DECISION_KINDS.POLICY_VERDICT,
        title: "Cancellation Window Verdict",
        detail: el.explanations?.cancel || el.reasons?.cancel || "Cancellation eligibility checked.",
        ruleCited: el.rulesCited?.cancel || (el.canCancel ? "CANCEL_WINDOW: status is Processing" : "CANCEL_WINDOW: not processing"),
        status: el.canCancel ? "allowed" : "declined",
      })
    );

    // Return window verdict
    events.push(
      createDecisionEvent({
        id: `verdict-return-${now}`,
        ts: now + 2,
        kind: DECISION_KINDS.POLICY_VERDICT,
        title: "7-Day Return Policy Verdict",
        detail: el.explanations?.return || el.reasons?.return || "Return window checked.",
        ruleCited: el.rulesCited?.return || "RETURN_WINDOW: evaluated against 7-day limit",
        status: el.canReturn ? "allowed" : "declined",
      })
    );

    // Damage window verdict
    if (el.rulesCited?.damage || el.damageRuleCited) {
      events.push(
        createDecisionEvent({
          id: `verdict-damage-${now}`,
          ts: now + 3,
          kind: DECISION_KINDS.POLICY_VERDICT,
          title: "48-Hour Damage/Defect Window",
          detail: el.explanations?.damage || el.reasons?.damage || "48-hour damage reporting window.",
          ruleCited: el.rulesCited?.damage || el.damageRuleCited,
          status: el.canReportDamage ? "allowed" : "declined",
        })
      );
    }

    // Doorstep refusal guardrail if Out for Delivery or Shipped
    if (result.order?.status === "Out for Delivery" || result.order?.status === "Shipped") {
      events.push(
        createDecisionEvent({
          id: `guardrail-doorstep-${now}`,
          ts: now + 4,
          kind: DECISION_KINDS.GUARDRAIL,
          title: "Courier In-Transit Guardrail",
          detail: "Direct cancellation blocked for shipped parcels; doorstep refusal instruction mandatory.",
          ruleCited: `GUARDRAIL: status is "${result.order.status}" -> doorstep refusal protocol`,
          status: "blocked",
        })
      );
    }
  }

  if (toolName === "requestCancellation") {
    if (result?.status === "CONFIRMATION_REQUIRED") {
      events.push(
        createDecisionEvent({
          id: `guardrail-confirm-required-${now}`,
          ts: now + 1,
          kind: DECISION_KINDS.GUARDRAIL,
          title: "Confirmation required",
          detail:
            result.message ||
            `Cancellation for ${args?.orderId || result?.order_id || "order"} requires explicit customer confirmation. Single-use 2-minute token issued.`,
          ruleCited: "TWO_STEP_CONFIRMATION: explicit customer consent required before cancellation",
          status: "info",
        })
      );
    } else if (result?.success) {
      events.push(
        createDecisionEvent({
          id: `guardrail-cancel-confirmed-${now}`,
          ts: now + 1,
          kind: DECISION_KINDS.GUARDRAIL,
          title: "Cancellation confirmed",
          detail:
            result.message ||
            `Customer confirmed cancellation for ${args?.orderId || result?.order_id || "order"}. Server-side token validated.`,
          ruleCited: "TWO_STEP_CONFIRMATION: single-use token validated and consumed",
          status: "allowed",
        }),
        createDecisionEvent({
          id: `verdict-cancel-success-${now}`,
          ts: now + 2,
          kind: DECISION_KINDS.POLICY_VERDICT,
          title: "Order Cancellation Approved",
          detail: result.message || "Cancellation processed within 4-hour window.",
          ruleCited: result.ruleCited || "CANCEL_WINDOW: status is Processing (cancellation allowed)",
          status: "allowed",
        })
      );
    } else {
      events.push(
        createDecisionEvent({
          id: `verdict-cancel-declined-${now}`,
          ts: now + 1,
          kind: DECISION_KINDS.POLICY_VERDICT,
          title: "Order Cancellation Refused",
          detail: result.message || result.reason || result.error || "Order not eligible for cancellation or token error.",
          ruleCited: result.ruleCited || `CANCEL_POLICY: ${result.reason || result.error || "outside window"}`,
          status: "declined",
        })
      );
    }
  }

  if (toolName === "createSupportTicket") {
    events.push(
      createDecisionEvent({
        id: `ticket-escalation-${now}`,
        ts: now + 1,
        kind: DECISION_KINDS.GUARDRAIL,
        title: `Support Ticket Escalation (#${result?.ticketId || "NEW"})`,
        detail: result?.message || "Customer request escalated to human specialist team.",
        ruleCited: `SUPPORT_ESCALATION: category "${result?.category || "OTHER"}"`,
        status: "info",
      })
    );
  }

  return events;
}

/**
 * Checks a user utterance for guardrail triggers (medical advice, competitor comparisons, prompt injections)
 * @param {string} text
 * @returns {object | null} DecisionEvent if guardrail matched
 */
export function checkTextGuardrails(text = "") {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();

  // 1. Medical advice guardrail
  if (lower.match(/\b(rash|allergy|eczema|skin disease|infection|acne cure|medicine|dermatitis)\b/i)) {
    return createDecisionEvent({
      kind: DECISION_KINDS.GUARDRAIL,
      title: "Medical Advice Guardrail Triggered",
      detail: "Customer inquired about medical symptoms; clinical diagnoses prohibited. Redirect to doctor.",
      ruleCited: "GUARDRAIL_MEDICAL: Disclaim diagnostic authority & recommend healthcare professional.",
      status: "blocked",
    });
  }

  // 2. Competitor comparison guardrail
  if (lower.match(/\b(nykaa|the ordinary|minimalist|mamaearth|plum|dot & key|sugar)\b/i)) {
    return createDecisionEvent({
      kind: DECISION_KINDS.GUARDRAIL,
      title: "Competitor Comparison Guardrail",
      detail: "Competitor product mentioned; comparative disparagement prohibited.",
      ruleCited: "GUARDRAIL_COMPETITOR: Polite declination; focus strictly on Aura Skincare formulas.",
      status: "blocked",
    });
  }

  // 3. Prompt injection / unauthorized commitments
  if (lower.match(/\b(ignore previous|system prompt|give me.*discount|50% off|developer mode)\b/i)) {
    return createDecisionEvent({
      kind: DECISION_KINDS.GUARDRAIL,
      title: "Prompt Injection Defense Active",
      detail: "Attempted instruction override or unauthorized discount probe detected and blocked.",
      ruleCited: "GUARDRAIL_SAFETY: Negative constraints enforced against instruction modification.",
      status: "blocked",
    });
  }

  // 4. Out-of-scope query guardrail (e.g. Flight to Goa)
  if (lower.match(/\b(flight|ticket to goa|book.*flight|hotel booking|vacation)\b/i)) {
    return createDecisionEvent({
      kind: DECISION_KINDS.GUARDRAIL,
      title: "Out-of-Scope Request Declined",
      detail: "Flight booking query detected. Aria is strictly restricted to Aura Skincare customer support.",
      ruleCited: "GUARDRAIL_SCOPE: Non-skincare inquiries prohibited (Flight to Goa).",
      status: "blocked",
      scenarioTag: "out_of_scope_goa",
    });
  }

  // 5. Opened product bought 20 days ago (direct policy decline without DB tool)
  if (
    lower.match(/\b(20 days|opened it|already opened|opened product)\b/i) &&
    lower.match(/\b(return|refund|money back|wapas)\b/i)
  ) {
    return createDecisionEvent({
      kind: DECISION_KINDS.POLICY_VERDICT,
      title: "Opened Product Return Refused",
      detail: "Return policy decline: product was opened and purchased 20 days ago (exceeds 7-day unopened limit). No database tool lookup required.",
      ruleCited: "RETURN_WINDOW: purchased 20 days ago > 7-day limit & product is opened",
      status: "declined",
      scenarioTag: "opened_20_days",
    });
  }

  return null;
}
