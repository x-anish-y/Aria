import { describe, it, expect } from "vitest";
import { GUIDED_SCENARIOS, evaluateScenarios } from "@/lib/scenarios";
import {
  createDecisionEvent,
  deriveDecisionEventsFromTool,
  checkTextGuardrails,
  DECISION_KINDS,
} from "@/lib/decision-events";

describe("Guided Test Mode Engine (lib/scenarios.js)", () => {
  it("defines exactly 8 evaluator scenarios with required metadata", () => {
    expect(GUIDED_SCENARIOS).toHaveLength(8);

    GUIDED_SCENARIOS.forEach((sc, idx) => {
      expect(sc.index).toBe(idx + 1);
      expect(sc.id).toBeTruthy();
      expect(sc.title).toBeTruthy();
      expect(sc.sentence).toBeTruthy();
      expect(sc.expected).toBeTruthy();
      expect(typeof sc.detect).toBe("function");
    });
  });

  describe("Pure function detectors against event logs", () => {
    it("Scenario 1: Detects getOrderDetails for ORD-101", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "track_ord_101").detect;

      expect(detector([])).toBe(false);
      expect(
        detector([
          { kind: "TOOL_CALL", name: "getOrderDetails", args: { orderId: "ORD-102" } },
        ])
      ).toBe(false);

      const events = deriveDecisionEventsFromTool(
        "getOrderDetails",
        { orderId: "ORD-101" },
        { found: true, order: { order_id: "ORD-101", status: "Out for Delivery" } },
        120
      );
      expect(detector(events)).toBe(true);
    });

    it("Scenario 2: Detects cancellation refusal for ORD-101 citing Out for Delivery", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "cancel_ord_101").detect;

      expect(detector([])).toBe(false);

      // Event from getOrderDetails on Out for Delivery order
      const derived = deriveDecisionEventsFromTool(
        "getOrderDetails",
        { orderId: "ORD-101" },
        {
          found: true,
          order: { order_id: "ORD-101", status: "Out for Delivery" },
          eligibility: {
            canCancel: false,
            rulesCited: {
              cancel:
                'CANCEL_WINDOW: order status is "Out for Delivery" (direct cancellation only allowed while Processing)',
            },
            reasons: {
              cancel: "Order is out for delivery. Direct cancellation is no longer possible.",
            },
          },
        },
        90
      );
      expect(detector(derived)).toBe(true);

      // Also directly from requestCancellation refusal
      const cancelRefusal = deriveDecisionEventsFromTool(
        "requestCancellation",
        { orderId: "ORD-101", reason: "Customer changed mind" },
        {
          success: false,
          reason: "Cancellation not allowed: order status is 'Out for Delivery'.",
          ruleCited:
            "CANCEL_POLICY: Cancellation not allowed: order status is 'Out for Delivery'.",
        },
        75
      );
      expect(detector(cancelRefusal)).toBe(true);
    });

    it("Scenario 3: Detects cancellation approved for ORD-103", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "cancel_ord_103").detect;

      expect(detector([])).toBe(false);

      const events = deriveDecisionEventsFromTool(
        "requestCancellation",
        { orderId: "ORD-103", reason: "Found better price" },
        {
          success: true,
          order_id: "ORD-103",
          message: "Order ORD-103 has been successfully cancelled.",
          ruleCited: "CANCEL_WINDOW: status is Processing (cancellation allowed)",
        },
        110
      );
      expect(detector(events)).toBe(true);
    });

    it("Scenario 4: Detects return decline for ORD-102 (14 days > 7-day limit)", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "return_ord_102").detect;

      expect(detector([])).toBe(false);

      const events = deriveDecisionEventsFromTool(
        "getOrderDetails",
        { orderId: "ORD-102" },
        {
          found: true,
          order: { order_id: "ORD-102", status: "Delivered" },
          eligibility: {
            canReturn: false,
            rulesCited: {
              return: "RETURN_WINDOW: delivered 14 days ago > 7-day limit",
            },
            reasons: {
              return: "Return window expired: delivered 14 days ago (strict 7-day policy limit).",
            },
          },
        },
        85
      );
      expect(detector(events)).toBe(true);
    });

    it("Scenario 5: Detects invalid order ORD-999 handled with ORDER_NOT_FOUND", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "invalid_ord_999").detect;

      expect(detector([])).toBe(false);

      const events = deriveDecisionEventsFromTool(
        "getOrderDetails",
        { orderId: "ORD-999" },
        {
          found: false,
          error: "ORDER_NOT_FOUND",
          message: "Order ORD-999 was not found in the Aura database.",
        },
        45
      );
      expect(detector(events)).toBe(true);
    });

    it("Scenario 6: Detects out-of-scope flight to Goa guardrail event", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "out_of_scope_goa").detect;

      expect(detector([])).toBe(false);

      const guardrail = checkTextGuardrails("Can you book me a flight to Goa this weekend?");
      expect(guardrail).not.toBeNull();
      expect(detector([guardrail])).toBe(true);
    });

    it("Scenario 7: Detects opened product bought 20 days ago policy decline", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "opened_20_days").detect;

      expect(detector([])).toBe(false);

      const policyVerdict = checkTextGuardrails(
        "I bought a serum 20 days ago and already opened it, can I return it?"
      );
      expect(policyVerdict).not.toBeNull();
      expect(detector([policyVerdict])).toBe(true);
    });

    it("Scenario 8: Detects barge-in speech interruption event", () => {
      const detector = GUIDED_SCENARIOS.find((s) => s.id === "barge_in_interruption").detect;

      expect(detector([])).toBe(false);

      const bargeInEvent = createDecisionEvent({
        kind: "BARGE_IN",
        title: "Barge-in Interruption Detected",
        detail: "Agent speech immediately aborted upon user voice activity.",
        ruleCited: "BARGE_IN: START_OF_ACTIVITY_INTERRUPTS",
        status: "active",
        isBargeIn: true,
      });

      expect(detector([bargeInEvent])).toBe(true);
    });
  });

  describe("evaluateScenarios() aggregation", () => {
    it("returns 0/8 when event log is empty", () => {
      const res = evaluateScenarios(GUIDED_SCENARIOS, []);
      expect(res.passedCount).toBe(0);
      expect(res.totalCount).toBe(8);
      expect(res.progress).toBe(0);
      expect(res.allPassed).toBe(false);
      expect(res.passedScenarios).toHaveLength(0);
      expect(res.remainingScenarios).toHaveLength(8);
    });

    it("accurately calculates partial progress", () => {
      const events = [
        ...deriveDecisionEventsFromTool(
          "getOrderDetails",
          { orderId: "ORD-101" },
          { found: true, order: { order_id: "ORD-101", status: "Out for Delivery" } },
          100
        ),
        checkTextGuardrails("Book me a flight to Goa please!"),
      ];

      const res = evaluateScenarios(GUIDED_SCENARIOS, events);
      expect(res.results.track_ord_101).toBe(true);
      expect(res.results.out_of_scope_goa).toBe(true);
      expect(res.results.invalid_ord_999).toBe(false);
      expect(res.passedCount).toBeGreaterThanOrEqual(2);
      expect(res.progress).toBe(res.passedCount / 8);
      expect(res.allPassed).toBe(false);
    });

    it("returns allPassed === true (8/8) when all conditions are fulfilled", () => {
      const allEvents = [
        // 1: Track ORD-101
        ...deriveDecisionEventsFromTool(
          "getOrderDetails",
          { orderId: "ORD-101" },
          { found: true, order: { order_id: "ORD-101", status: "Out for Delivery" } },
          100
        ),
        // 2: Cancel ORD-101
        createDecisionEvent({
          kind: DECISION_KINDS.POLICY_VERDICT,
          title: "Order Cancellation Refused",
          detail: "Doorstep refusal advised.",
          ruleCited: "Out for Delivery doorstep refusal",
          status: "declined",
        }),
        // 3: Cancel ORD-103
        ...deriveDecisionEventsFromTool(
          "requestCancellation",
          { orderId: "ORD-103" },
          { success: true, order_id: "ORD-103", message: "Cancelled successfully" },
          95
        ),
        // 4: Return ORD-102
        createDecisionEvent({
          kind: DECISION_KINDS.POLICY_VERDICT,
          title: "7-Day Return Policy Verdict",
          detail: "Delivered 14 days ago.",
          ruleCited: "RETURN_WINDOW: delivered 14 days ago > 7-day limit",
          status: "declined",
        }),
        // 5: Invalid ORD-999
        ...deriveDecisionEventsFromTool(
          "getOrderDetails",
          { orderId: "ORD-999" },
          { found: false, error: "ORDER_NOT_FOUND" },
          50
        ),
        // 6: Flight to Goa
        checkTextGuardrails("Can you book me a flight to Goa?"),
        // 7: Opened 20 days ago
        checkTextGuardrails("I opened the product bought 20 days ago, can I return?"),
        // 8: Barge-in
        createDecisionEvent({
          kind: "BARGE_IN",
          title: "Barge-in Interruption Detected",
          ruleCited: "BARGE_IN: START_OF_ACTIVITY_INTERRUPTS",
          isBargeIn: true,
        }),
      ];

      const res = evaluateScenarios(GUIDED_SCENARIOS, allEvents);
      expect(res.passedCount).toBe(8);
      expect(res.totalCount).toBe(8);
      expect(res.progress).toBe(1);
      expect(res.allPassed).toBe(true);
      expect(res.remainingScenarios).toHaveLength(0);
    });
  });
});
