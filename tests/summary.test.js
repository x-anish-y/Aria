import { describe, it, expect, beforeEach } from "vitest";
import {
  buildDeterministicSummary,
  validateAndSanitizeSummary,
  ALLOWED_INTENTS,
  ALLOWED_RESOLUTIONS,
  ALLOWED_SENTIMENTS,
} from "../lib/summary.js";
import { POST as summaryHandler } from "../app/api/summary/route.js";
import { GET as callsHandler } from "../app/api/calls/route.js";
import { clearInMemoryCalls } from "../lib/db.js";

describe("Task 7: Post-call summary & history", () => {
  beforeEach(() => {
    clearInMemoryCalls();
  });

  describe("Deterministic Summary Generator & Grounding", () => {
    it("generates grounded ORDER_TRACKING summary with toolEvents (Sample 1)", () => {
      const transcript = [
        {
          speaker: "user",
          text: "Hi Aria, where is my order ORD-101?",
          timestamp: "00:03",
        },
        {
          speaker: "agent",
          text: "Let me check that for you right now.",
          timestamp: "00:05",
        },
        {
          speaker: "agent",
          text: "Your order ORD-101 is currently Out for Delivery with BlueDart and expected by 6 PM today.",
          timestamp: "00:08",
        },
        {
          speaker: "user",
          text: "That is great, thank you so much!",
          timestamp: "00:11",
        },
      ];

      const toolEvents = [
        {
          name: "getOrderDetails",
          args: { orderId: "ORD-101" },
          result: {
            found: true,
            order: {
              order_id: "ORD-101",
              customer_name: "Priya Sharma",
              status: "Out for Delivery",
              courier: "BlueDart",
              expected_delivery: "Expected by 6 PM today",
            },
          },
        },
      ];

      const summary = buildDeterministicSummary({ transcript, toolEvents });

      expect(summary.customer_intent).toBe("ORDER_TRACKING");
      expect(summary.order_id).toBe("ORD-101");
      expect(summary.resolution_status).toBe("RESOLVED");
      expect(summary.customer_sentiment).toBe("POSITIVE");
      expect(summary.call_summary).toContain("ORD-101");
      expect(summary.actions_taken.length).toBeGreaterThan(0);
      expect(summary.actions_taken[0]).toContain("ORD-101");
      expect(ALLOWED_INTENTS).toContain(summary.customer_intent);
      expect(ALLOWED_RESOLUTIONS).toContain(summary.resolution_status);
      expect(ALLOWED_SENTIMENTS).toContain(summary.customer_sentiment);
    });

    it("generates POLICY_DECLINED summary for return outside window (Sample 2)", () => {
      const transcript = [
        {
          speaker: "user",
          text: "I want to return my sunscreen for order ORD-102. It was delivered 2 weeks ago.",
          timestamp: "00:04",
        },
        {
          speaker: "agent",
          text: "I checked your order ORD-102. Under our policy, returns must be requested within 7 days of delivery.",
          timestamp: "00:09",
        },
        {
          speaker: "user",
          text: "I see, that is unfortunate but I understand.",
          timestamp: "00:14",
        },
      ];

      const toolEvents = [
        {
          name: "getOrderDetails",
          args: { orderId: "ORD-102" },
          result: {
            found: true,
            order: {
              order_id: "ORD-102",
              status: "Delivered",
              delivered_days_ago: 14,
            },
            eligibility: {
              can_return: false,
              reasons: {
                return:
                  "Delivered 14 days ago. Aura return window is 7 days from delivery.",
              },
            },
          },
        },
      ];

      const summary = buildDeterministicSummary({ transcript, toolEvents });

      expect(summary.customer_intent).toBe("RETURN_REFUND");
      expect(summary.order_id).toBe("ORD-102");
      expect(summary.resolution_status).toBe("POLICY_DECLINED");
      expect(summary.policy_notes).toContain("7 days");
      expect(summary.call_summary.length).toBeGreaterThan(20);
      expect(summary.actions_taken.length).toBeGreaterThan(0);
    });

    it("generates ABANDONED summary for empty or short calls (Sample 3)", () => {
      // Empty transcript
      const emptySummary = buildDeterministicSummary({ transcript: [], toolEvents: [] });
      expect(emptySummary.resolution_status).toBe("ABANDONED");
      expect(emptySummary.customer_intent).toBe("OTHER");
      expect(emptySummary.order_id).toBeNull();
      expect(emptySummary.actions_taken).toEqual([]);
      expect(emptySummary.call_summary).toContain("concluded before");

      // Short call without user speech
      const agentOnlyTranscript = [
        {
          speaker: "agent",
          text: "Hi there! Welcome to Aura Skincare. How can I help you today?",
          timestamp: "00:02",
        },
      ];
      const agentSummary = buildDeterministicSummary({
        transcript: agentOnlyTranscript,
        toolEvents: [],
      });
      expect(agentSummary.resolution_status).toBe("ABANDONED");
    });

    it("validateAndSanitizeSummary strictly grounds ungrounded model output in toolEvents", () => {
      const mockRawLLMOutput = {
        customer_intent: "ORDER_TRACKING",
        order_id: "ORD-999-HALLUCINATED", // Model hallucination!
        resolution_status: "RESOLVED",
        call_summary: "Customer called to check on their shipment.",
        policy_notes: null,
        customer_sentiment: "NEUTRAL",
        actions_taken: ["Made up action"],
      };

      const toolEvents = [
        {
          name: "getOrderDetails",
          args: { orderId: "ORD-101" },
          result: { found: true },
        },
      ];

      const sanitized = validateAndSanitizeSummary(mockRawLLMOutput, {
        transcript: [{ speaker: "user", text: "Where is my order?" }],
        toolEvents,
      });

      // Grounded in toolEvents!
      expect(sanitized.order_id).toBe("ORD-101");
      // Grounded actions included
      expect(
        sanitized.actions_taken.some((a) => a.includes("ORD-101"))
      ).toBe(true);
    });
  });

  describe("API Endpoints", () => {
    it("POST /api/summary returns structured summary and persists call", async () => {
      const req = new Request("http://localhost:3000/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "test-eval-session-123",
          mode: "realtime",
          startedAt: new Date(Date.now() - 30000).toISOString(),
          endedAt: new Date().toISOString(),
          transcript: [
            { speaker: "user", text: "Where is ORD-101?", timestamp: "00:02" },
            { speaker: "agent", text: "It is out for delivery with BlueDart.", timestamp: "00:05" },
          ],
          toolEvents: [
            {
              name: "getOrderDetails",
              args: { orderId: "ORD-101" },
              result: { found: true, order: { order_id: "ORD-101", status: "Out for Delivery" } },
            },
          ],
          metrics: { turns: 2, avgLatencyMs: 650, p50LatencyMs: 620 },
        }),
      });

      const res = await summaryHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.summary).toBeDefined();
      expect(data.summary.customer_intent).toBe("ORDER_TRACKING");
      expect(data.summary.order_id).toBe("ORD-101");
      expect(ALLOWED_RESOLUTIONS).toContain(data.summary.resolution_status);
      expect(data.callId).toBeDefined();

      // Check GET /api/calls retrieves the persisted call
      const getReq = new Request(
        "http://localhost:3000/api/calls?sessionId=test-eval-session-123"
      );
      const getRes = await callsHandler(getReq);
      expect(getRes.status).toBe(200);

      const historyData = await getRes.json();
      expect(historyData.ok).toBe(true);
      expect(historyData.calls.length).toBeGreaterThan(0);
      expect(historyData.calls[0].session_id).toBe("test-eval-session-123");
      expect(historyData.calls[0].summary.order_id).toBe("ORD-101");
    });

    it("POST /api/summary returns ABANDONED for empty calls without blocking", async () => {
      const req = new Request("http://localhost:3000/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "empty-session-456",
          transcript: [],
          toolEvents: [],
        }),
      });

      const res = await summaryHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.summary.resolution_status).toBe("ABANDONED");
      expect(data.source).toBe("deterministic_abandoned");
    });
  });
});
