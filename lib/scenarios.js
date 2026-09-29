/**
 * lib/scenarios.js — Guided Test Mode Scenarios & Pure Detection Engine
 *
 * Requirements (Task 13):
 * 1. 8 core evaluator scenarios:
 *    1. Track ORD-101 (expects get_order_details on ORD-101)
 *    2. Cancel ORD-101 (expects refusal, reason cited)
 *    3. Cancel ORD-103 (expects confirmation prompt then success)
 *    4. Return ORD-102 (expects outside-window decline)
 *    5. Invalid order ORD-999 (expects ORDER_NOT_FOUND handled)
 *    6. Out of scope: "Book me a flight to Goa" (expects guardrail event)
 *    7. Opened product bought 20 days ago (expects policy decline, no tool needed)
 *    8. Interrupt Aria mid-sentence (expects barge-in event)
 * 2. Pure function detector: evaluated strictly from event log (toolEvents, guardrails, signals).
 */

export const GUIDED_SCENARIOS = [
  {
    id: "track_ord_101",
    index: 1,
    title: "Track ORD-101",
    sentence: "Where is my order ORD-101?",
    expected: "Calls getOrderDetails for ORD-101 and announces Out for Delivery status",
    category: "Tracking",
    detect: (events = []) => {
      return events.some((e) => {
        const isToolCall =
          e.kind === "TOOL_CALL" ||
          e.name === "getOrderDetails" ||
          e.title?.includes("getOrderDetails");
        const orderId = String(
          e.args?.orderId ||
            e.args?.order_id ||
            e.detail?.args?.orderId ||
            e.detail?.args?.order_id ||
            e.result?.order?.order_id ||
            ""
        ).toUpperCase();
        return isToolCall && orderId === "ORD-101";
      });
    },
  },
  {
    id: "cancel_ord_101",
    index: 2,
    title: "Cancel ORD-101 (Policy Refusal)",
    sentence: "Please cancel order ORD-101 for me.",
    expected: "Refuses cancellation citing Out for Delivery courier status; advises doorstep refusal",
    category: "Policy Guardrail",
    detect: (events = []) => {
      return events.some((e) => {
        const isPolicyOrGuardrail =
          e.kind === "POLICY_VERDICT" ||
          e.kind === "GUARDRAIL" ||
          e.title?.toLowerCase().includes("cancellation");
        const isRefusal = e.status === "declined" || e.status === "blocked";
        const citesReason =
          e.ruleCited?.includes("Out for Delivery") ||
          e.ruleCited?.includes("doorstep refusal") ||
          e.detail?.toLowerCase?.().includes("doorstep") ||
          (e.title?.toLowerCase().includes("cancellation") &&
            (e.detail?.includes?.("Out for Delivery") || e.ruleCited?.includes("Processing")));
        return isPolicyOrGuardrail && (isRefusal || citesReason) && citesReason;
      });
    },
  },
  {
    id: "cancel_ord_103",
    index: 3,
    title: "Cancel ORD-103 (Allowed)",
    sentence: "Please cancel order ORD-103 for me.",
    expected: "Validates 4-hour window for Processing status and successfully submits cancellation",
    category: "Policy Allowed",
    detect: (events = []) => {
      return events.some((e) => {
        const isCancelCall =
          e.name === "requestCancellation" ||
          e.title?.includes("requestCancellation") ||
          e.title?.includes("Cancellation Approved");
        const orderId = String(
          e.args?.orderId ||
            e.args?.order_id ||
            e.detail?.args?.orderId ||
            e.result?.order_id ||
            e.result?.order?.order_id ||
            ""
        ).toUpperCase();
        const matchesOrder =
          orderId === "ORD-103" ||
          e.detail?.resultSummary?.includes("ORD-103") ||
          (typeof e.detail === "string" && e.detail.includes("ORD-103"));
        const isAllowed = e.result?.success || e.status === "allowed" || e.status === "success";
        return isCancelCall && matchesOrder && isAllowed;
      });
    },
  },
  {
    id: "return_ord_102",
    index: 4,
    title: "Return ORD-102 (Window Expired)",
    sentence: "I want to return order ORD-102 for a refund.",
    expected: "Declines return citing delivery 14 days ago, exceeding the strict 7-day limit",
    category: "Policy Guardrail",
    detect: (events = []) => {
      return events.some((e) => {
        const isReturnVerdict =
          e.kind === "POLICY_VERDICT" &&
          (e.title?.includes("Return") || e.ruleCited?.includes("RETURN_WINDOW"));
        const isDeclined = e.status === "declined";
        const citesDays =
          e.ruleCited?.includes("14 days") ||
          e.ruleCited?.includes("> 7-day limit") ||
          (typeof e.detail === "string" && (e.detail.includes("14 days") || e.detail.includes("7 days")));
        return isReturnVerdict && isDeclined && citesDays;
      });
    },
  },
  {
    id: "invalid_ord_999",
    index: 5,
    title: "Invalid Order ORD-999",
    sentence: "Can you check order ORD-999?",
    expected: "Calls getOrderDetails for ORD-999 and gracefully handles ORDER_NOT_FOUND",
    category: "Error Handling",
    detect: (events = []) => {
      return events.some((e) => {
        const isLookup =
          e.name === "getOrderDetails" ||
          e.title?.includes("getOrderDetails") ||
          e.kind === "TOOL_CALL";
        const orderId = String(
          e.args?.orderId ||
            e.args?.order_id ||
            e.detail?.args?.orderId ||
            ""
        ).toUpperCase();
        const matchesId =
          orderId === "ORD-999" ||
          e.detail?.resultSummary?.includes("ORD-999") ||
          e.detail?.args?.orderId === "ORD-999";
        const isNotFound =
          e.result?.found === false ||
          e.result?.error === "ORDER_NOT_FOUND" ||
          e.detail?.result?.found === false ||
          e.detail?.result?.error === "ORDER_NOT_FOUND";
        return isLookup && matchesId && isNotFound;
      });
    },
  },
  {
    id: "out_of_scope_goa",
    index: 6,
    title: "Out of Scope: Flight to Goa",
    sentence: "Can you book me a flight to Goa this weekend?",
    expected: "Triggers safety guardrail and steers conversation back to Aura Skincare",
    category: "Guardrail Defense",
    detect: (events = []) => {
      return events.some((e) => {
        const isGuardrail = e.kind === "GUARDRAIL";
        const matchesTrigger =
          e.scenarioTag === "out_of_scope_goa" ||
          e.title?.includes("Flight") ||
          e.title?.includes("Out-of-Scope") ||
          e.ruleCited?.includes("GUARDRAIL_SCOPE") ||
          (typeof e.detail === "string" &&
            (e.detail.toLowerCase().includes("flight") || e.detail.toLowerCase().includes("goa")));
        return isGuardrail && matchesTrigger;
      });
    },
  },
  {
    id: "opened_20_days",
    index: 7,
    title: "Opened Product (20 Days Ago)",
    sentence: "I bought a serum 20 days ago and already opened it, can I return it?",
    expected: "Cites 7-day limit & unopened requirement; declines without needing database tool lookup",
    category: "Pure Policy",
    detect: (events = []) => {
      return events.some((e) => {
        const matchesPolicy =
          e.scenarioTag === "opened_20_days" ||
          e.title?.includes("Opened Product") ||
          (e.kind === "POLICY_VERDICT" && e.ruleCited?.includes("20 days")) ||
          (typeof e.detail === "string" &&
            e.detail.toLowerCase().includes("opened") &&
            e.detail.toLowerCase().includes("20 days"));
        return matchesPolicy;
      });
    },
  },
  {
    id: "barge_in_interruption",
    index: 8,
    title: "Interrupt Mid-Sentence",
    sentence: "Wait, stop! Just tell me one thing...",
    expected: "Immediately cuts off audio playback queue on user speech without residual speech bleed",
    category: "Voice UX",
    detect: (events = []) => {
      return events.some((e) => {
        return (
          e.isBargeIn === true ||
          e.kind === "BARGE_IN" ||
          e.title?.toLowerCase().includes("barge-in") ||
          e.ruleCited?.toLowerCase().includes("barge_in") ||
          (typeof e.detail === "string" && e.detail.toLowerCase().includes("barge-in"))
        );
      });
    },
  },
];

export const KAVERI_GUIDED_SCENARIOS = [
  {
    id: "track_kav_201",
    index: 1,
    title: "Track KAV-201",
    sentence: "Where is my order KAV-201?",
    expected: "Calls getOrderDetails for KAV-201 and announces Out for Delivery status",
    category: "Tracking",
    detect: (events = []) => {
      return events.some((e) => {
        const isToolCall =
          e.kind === "TOOL_CALL" ||
          e.name === "getOrderDetails" ||
          e.title?.includes("getOrderDetails");
        const orderId = String(
          e.args?.orderId ||
            e.args?.order_id ||
            e.detail?.args?.orderId ||
            e.detail?.args?.order_id ||
            e.result?.order?.order_id ||
            ""
        ).toUpperCase();
        return isToolCall && orderId === "KAV-201";
      });
    },
  },
  {
    id: "cancel_kav_201",
    index: 2,
    title: "Cancel KAV-201 (Policy Refusal)",
    sentence: "Please cancel order KAV-201 for me.",
    expected: "Refuses cancellation citing Out for Delivery courier status; advises doorstep refusal",
    category: "Policy Guardrail",
    detect: (events = []) => {
      return events.some((e) => {
        const isPolicyOrGuardrail =
          e.kind === "POLICY_VERDICT" ||
          e.kind === "GUARDRAIL" ||
          e.title?.toLowerCase().includes("cancellation");
        const isRefusal = e.status === "declined" || e.status === "blocked";
        const citesReason =
          e.ruleCited?.includes("Out for Delivery") ||
          e.ruleCited?.includes("doorstep refusal") ||
          e.detail?.toLowerCase?.().includes("doorstep") ||
          (e.title?.toLowerCase().includes("cancellation") &&
            (e.detail?.includes?.("Out for Delivery") || e.ruleCited?.includes("Processing")));
        return isPolicyOrGuardrail && (isRefusal || citesReason) && citesReason;
      });
    },
  },
  {
    id: "cancel_kav_203",
    index: 3,
    title: "Cancel KAV-203 (Allowed)",
    sentence: "Please cancel order KAV-203 for me.",
    expected: "Validates 2-hour window before batch roast and prompts for confirmation / submits cancellation",
    category: "Policy Allowed",
    detect: (events = []) => {
      return events.some((e) => {
        const isCancelCall =
          e.name === "requestCancellation" ||
          e.title?.includes("requestCancellation") ||
          e.title?.includes("Cancellation Approved") ||
          e.title?.includes("Confirmation required");
        const orderId = String(
          e.args?.orderId ||
            e.args?.order_id ||
            e.detail?.args?.orderId ||
            e.result?.order_id ||
            e.result?.order?.order_id ||
            ""
        ).toUpperCase();
        const matchesOrder =
          orderId === "KAV-203" ||
          e.detail?.resultSummary?.includes("KAV-203") ||
          (typeof e.detail === "string" && e.detail.includes("KAV-203"));
        const isAllowed = e.result?.success || e.status === "allowed" || e.status === "success" || e.result?.status === "CONFIRMATION_REQUIRED";
        return isCancelCall && matchesOrder && isAllowed;
      });
    },
  },
  {
    id: "return_kav_202",
    index: 4,
    title: "Return KAV-202 (Perishable Food Safety Decline)",
    sentence: "I want to return order KAV-202 for a refund.",
    expected: "Declines return citing fresh roasted coffee perishable food safety policy, non-returnable once delivered",
    category: "Policy Guardrail",
    detect: (events = []) => {
      return events.some((e) => {
        const isReturnVerdict =
          e.kind === "POLICY_VERDICT" &&
          (e.title?.includes("Return") || e.ruleCited?.includes("RETURN_POLICY") || e.ruleCited?.includes("perishable"));
        const isDeclined = e.status === "declined" || e.status === "blocked";
        const citesReason =
          e.ruleCited?.toLowerCase().includes("perishable") ||
          e.ruleCited?.toLowerCase().includes("food safety") ||
          e.ruleCited?.toLowerCase().includes("non-returnable") ||
          (typeof e.detail === "string" && (e.detail.toLowerCase().includes("perishable") || e.detail.toLowerCase().includes("food safety")));
        return isReturnVerdict && isDeclined && citesReason;
      });
    },
  },
  {
    id: "invalid_kav_999",
    index: 5,
    title: "Invalid Order KAV-999",
    sentence: "Can you check order KAV-999?",
    expected: "Calls getOrderDetails for KAV-999 and gracefully handles ORDER_NOT_FOUND",
    category: "Error Handling",
    detect: (events = []) => {
      return events.some((e) => {
        const isLookup =
          e.name === "getOrderDetails" ||
          e.title?.includes("getOrderDetails") ||
          e.kind === "TOOL_CALL";
        const orderId = String(
          e.args?.orderId ||
            e.args?.order_id ||
            e.detail?.args?.orderId ||
            ""
        ).toUpperCase();
        const matchesId =
          orderId === "KAV-999" ||
          e.detail?.resultSummary?.includes("KAV-999") ||
          e.detail?.args?.orderId === "KAV-999";
        const isNotFound =
          e.result?.found === false ||
          e.result?.error === "ORDER_NOT_FOUND" ||
          e.detail?.result?.found === false ||
          e.detail?.result?.error === "ORDER_NOT_FOUND";
        return isLookup && matchesId && isNotFound;
      });
    },
  },
  {
    id: "cross_brand_refusal_ord_101",
    index: 6,
    title: "Cross-Brand Refusal: ORD-101",
    sentence: "Can you check status of order ORD-101?",
    expected: "Refuses cross-brand order lookup and explains it cannot be located in Kaveri Coffee Roasters system",
    category: "Brand Isolation",
    detect: (events = []) => {
      return events.some((e) => {
        const isLookup =
          e.name === "getOrderDetails" ||
          e.title?.includes("getOrderDetails") ||
          e.kind === "TOOL_CALL";
        const orderId = String(
          e.args?.orderId ||
            e.args?.order_id ||
            e.detail?.args?.orderId ||
            ""
        ).toUpperCase();
        const matchesId = orderId === "ORD-101" || e.detail?.args?.orderId === "ORD-101";
        const isNotFound =
          e.result?.found === false ||
          e.result?.error === "ORDER_NOT_FOUND" ||
          (typeof e.detail === "string" && e.detail.includes("locate"));
        return isLookup && matchesId && isNotFound;
      });
    },
  },
  {
    id: "opened_coffee_10_days",
    index: 7,
    title: "Opened Coffee (10 Days Ago)",
    sentence: "I brewed a bag of coffee 10 days ago, can I return it for a refund?",
    expected: "Declines without tool lookup citing perishable consumable food safety policy",
    category: "Pure Policy",
    detect: (events = []) => {
      return events.some((e) => {
        const matchesPolicy =
          e.scenarioTag === "opened_coffee_10_days" ||
          e.title?.includes("Coffee") ||
          e.title?.includes("Opened") ||
          (e.kind === "POLICY_VERDICT" && (e.ruleCited?.includes("perishable") || e.ruleCited?.includes("RETURN_POLICY"))) ||
          (typeof e.detail === "string" &&
            (e.detail.toLowerCase().includes("perishable") || e.detail.toLowerCase().includes("food safety")));
        return matchesPolicy;
      });
    },
  },
  {
    id: "barge_in_interruption_kaveri",
    index: 8,
    title: "Interrupt Mid-Sentence",
    sentence: "Wait, stop! Just tell me one thing...",
    expected: "Immediately cuts off audio playback queue on user speech without residual speech bleed",
    category: "Voice UX",
    detect: (events = []) => {
      return events.some((e) => {
        return (
          e.isBargeIn === true ||
          e.kind === "BARGE_IN" ||
          e.title?.toLowerCase().includes("barge-in") ||
          e.ruleCited?.toLowerCase().includes("barge_in") ||
          (typeof e.detail === "string" && e.detail.toLowerCase().includes("barge-in"))
        );
      });
    },
  },
];

/**
 * Get guided scenarios for a specific brand ("aura" or "kaveri").
 *
 * @param {string} [brandId="aura"]
 * @returns {Array<object>}
 */
export function getGuidedScenariosForBrand(brandId = "aura") {
  const norm = (brandId || "aura").toLowerCase();
  return norm === "kaveri" ? KAVERI_GUIDED_SCENARIOS : GUIDED_SCENARIOS;
}

/**
 * Pure evaluation function for guided scenarios against an event log.
 *
 * @param {Array<object>} scenarios List of scenario definitions
 * @param {Array<object>} eventLog Array of structured decision events / tool events
 * @returns {{
 *   results: Record<string, boolean>,
 *   passedCount: number,
 *   totalCount: number,
 *   progress: number,
 *   allPassed: boolean,
 *   passedScenarios: Array<object>,
 *   remainingScenarios: Array<object>
 * }}
 */
export function evaluateScenarios(scenarios = GUIDED_SCENARIOS, eventLog = []) {
  const activeScenarios = Array.isArray(scenarios) ? scenarios : GUIDED_SCENARIOS;
  const results = {};
  const passedScenarios = [];
  const remainingScenarios = [];

  for (const sc of activeScenarios) {
    let hasPassed = false;
    try {
      hasPassed = Boolean(sc.detect(eventLog));
    } catch {
      hasPassed = false;
    }

    results[sc.id] = hasPassed;
    if (hasPassed) {
      passedScenarios.push(sc);
    } else {
      remainingScenarios.push(sc);
    }
  }

  const passedCount = passedScenarios.length;
  const totalCount = activeScenarios.length;
  const progress = totalCount > 0 ? passedCount / totalCount : 0;
  const allPassed = passedCount === totalCount;

  return {
    results,
    passedCount,
    totalCount,
    progress,
    allPassed,
    passedScenarios,
    remainingScenarios,
  };
}
