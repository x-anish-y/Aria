import { describe, it, expect, beforeEach } from "vitest";
import {
  QA_SCHEMA,
  buildNullQAScorecard,
  validateAndSanitizeQAScorecard,
  buildDeterministicQAScorecard,
} from "@/lib/summary";
import {
  saveCallRecord,
  getCallRecordById,
  updateCallSummaryQa,
  getInsightsData,
  clearInMemoryCalls,
} from "@/lib/db";
import { POST } from "@/app/api/summary/route";

describe("Task 17: Automatic QA Scorecard", () => {
  beforeEach(() => {
    clearInMemoryCalls();
  });

  describe("QA Schema & Validation", () => {
    it("has required fields in QA_SCHEMA", () => {
      expect(QA_SCHEMA.required).toContain("policy_adherence");
      expect(QA_SCHEMA.required).toContain("accuracy_of_information");
      expect(QA_SCHEMA.required).toContain("empathy_and_tone");
      expect(QA_SCHEMA.required).toContain("conciseness");
      expect(QA_SCHEMA.required).toContain("resolution_effectiveness");
      expect(QA_SCHEMA.required).toContain("unsupported_promise_detected");
      expect(QA_SCHEMA.required).toContain("coaching_note");
    });

    it("buildNullQAScorecard returns null metrics for graceful fallback", () => {
      const nullCard = buildNullQAScorecard("LLM service unavailable");
      expect(nullCard.policy_adherence).toBeNull();
      expect(nullCard.accuracy_of_information).toBeNull();
      expect(nullCard.empathy_and_tone).toBeNull();
      expect(nullCard.conciseness).toBeNull();
      expect(nullCard.resolution_effectiveness).toBeNull();
      expect(nullCard.unsupported_promise_detected).toBe(false);
      expect(nullCard.coaching_note).toBe("LLM service unavailable");
    });

    it("validateAndSanitizeQAScorecard clamps scores 1 to 5 and ensures boolean flag", () => {
      const sanitized = validateAndSanitizeQAScorecard({
        policy_adherence: 10, // out of range -> clamped to 5
        accuracy_of_information: -2, // out of range -> clamped to 1
        empathy_and_tone: 4,
        conciseness: 3,
        resolution_effectiveness: 5,
        unsupported_promise_detected: 1, // truthy -> boolean true
        coaching_note: "Review return policy.",
      });

      expect(sanitized.policy_adherence).toBe(5);
      expect(sanitized.accuracy_of_information).toBe(1);
      expect(sanitized.empathy_and_tone).toBe(4);
      expect(sanitized.unsupported_promise_detected).toBe(true);
      expect(sanitized.coaching_note).toBe("Review return policy.");
    });
  });

  describe("Deterministic Fallback QA Evaluator", () => {
    it("awards 5/5 policy adherence when agent enforces legitimate policy decline", () => {
      const transcript = [
        { speaker: "user", text: "I want to return ORD-102 delivered 14 days ago." },
        { speaker: "agent", text: "Under our 7-day return policy, returns must be within 7 days. I cannot accept this return." },
      ];
      const summary = { resolution_status: "POLICY_DECLINED" };

      const qa = buildDeterministicQAScorecard({ transcript, toolEvents: [], summary });
      expect(qa.policy_adherence).toBe(5);
      expect(qa.accuracy_of_information).toBe(5);
      expect(qa.unsupported_promise_detected).toBe(false);
      expect(qa.coaching_note).toContain("policy explanation");
    });

    it("detects unauthorized verbal promises and flags the call", () => {
      const transcript = [
        { speaker: "user", text: "Can you refund my opened lotion?" },
        { speaker: "agent", text: "Don't worry, I guarantee a full refund right now!" },
      ];
      const summary = { resolution_status: "RESOLVED" };

      const qa = buildDeterministicQAScorecard({ transcript, toolEvents: [], summary });
      expect(qa.unsupported_promise_detected).toBe(true);
      expect(qa.policy_adherence).toBeLessThanOrEqual(2);
      expect(qa.coaching_note).toContain("Flagged");
    });
  });

  describe("DB Persistence & updateCallSummaryQa", () => {
    it("updates call summary with QA scorecard", async () => {
      const saveRes = await saveCallRecord({
        sessionId: "test-session-qa-1",
        mode: "realtime",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: 30,
        transcript: [{ speaker: "user", text: "Hello" }],
        toolEvents: [],
        summary: { customer_intent: "ORDER_TRACKING", resolution_status: "RESOLVED" },
      });

      expect(saveRes.ok).toBe(true);
      const callId = saveRes.id;

      const qaPayload = {
        policy_adherence: 5,
        accuracy_of_information: 5,
        empathy_and_tone: 5,
        conciseness: 4,
        resolution_effectiveness: 5,
        unsupported_promise_detected: false,
        coaching_note: "Flawless call execution.",
      };

      const updateRes = await updateCallSummaryQa(callId, qaPayload);
      expect(updateRes.ok).toBe(true);

      const retrieved = await getCallRecordById(callId);
      expect(retrieved.summary.qa).toBeDefined();
      expect(retrieved.summary.qa.policy_adherence).toBe(5);
      expect(retrieved.summary.qa.coaching_note).toBe("Flawless call execution.");
    });
  });

  describe("/api/summary Non-Blocking QA Route Handler", () => {
    it("handles action='qa' without regenerating the summary", async () => {
      const req = new Request("http://localhost:3000/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "qa",
          callId: "test-call-route-1",
          transcript: [
            { speaker: "user", text: "Track ORD-101" },
            { speaker: "agent", text: "Your order ORD-101 is out for delivery with BlueDart." },
          ],
          toolEvents: [
            { name: "getOrderDetails", args: { orderId: "ORD-101" }, result: { status: "Out for Delivery" } },
          ],
          summary: {
            customer_intent: "ORDER_TRACKING",
            resolution_status: "RESOLVED",
            call_summary: "Confirmed out for delivery status with BlueDart.",
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.qa).toBeDefined();
      expect(typeof json.qa.policy_adherence).toBe("number");
      expect(typeof json.qa.unsupported_promise_detected).toBe("boolean");
      expect(typeof json.qa.coaching_note).toBe("string");
    });
  });

  describe("getInsightsData Aggregation", () => {
    it("computes qaAverages, qaTrend, and flaggedCalls", async () => {
      const data = await getInsightsData();
      expect(data).toHaveProperty("qaAverages");
      expect(data.qaAverages).toHaveProperty("overallScore");
      expect(data.qaAverages).toHaveProperty("policyAdherence");
      expect(data.qaAverages).toHaveProperty("accuracy");
      expect(data.qaAverages).toHaveProperty("empathy");
      expect(data.qaAverages).toHaveProperty("flaggedCount");

      expect(data).toHaveProperty("qaTrend");
      expect(Array.isArray(data.qaTrend)).toBe(true);
      expect(data.qaTrend.length).toBeGreaterThan(0);

      expect(data).toHaveProperty("flaggedCalls");
      expect(Array.isArray(data.flaggedCalls)).toBe(true);
      // seed demo call flagged call should be present
      expect(data.flaggedCalls.length).toBeGreaterThanOrEqual(1);
      expect(data.flaggedCalls[0].unsupportedPromiseDetected).toBe(true);
    });
  });
});
