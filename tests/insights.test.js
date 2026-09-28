import { describe, it, expect } from "vitest";
import { getInsightsData } from "../lib/db.js";
import { GET as insightsHandler } from "../app/api/insights/route.js";

describe("Task 8: /api/insights aggregation", () => {
  it("getInsightsData returns complete aggregated analytics structure", async () => {
    const data = await getInsightsData();

    expect(data).toBeDefined();
    expect(typeof data.totalCalls).toBe("number");
    expect(data.totalCalls).toBeGreaterThan(0);
    expect(typeof data.callsToday).toBe("number");
    expect(typeof data.avgDuration).toBe("number");
    expect(typeof data.p50Latency).toBe("number");
    expect(typeof data.p95Latency).toBe("number");

    // Resolution breakdown
    expect(data.resolutionBreakdown).toBeDefined();
    expect(data.resolutionBreakdown.RESOLVED).toBeGreaterThanOrEqual(0);
    expect(data.resolutionBreakdown.POLICY_DECLINED).toBeGreaterThanOrEqual(0);

    // Intent breakdown
    expect(data.intentBreakdown).toBeDefined();
    expect(data.intentBreakdown.ORDER_TRACKING).toBeGreaterThanOrEqual(0);
    expect(data.intentBreakdown.CANCELLATION).toBeGreaterThanOrEqual(0);

    // Sentiment breakdown
    expect(data.sentimentBreakdown).toBeDefined();
    expect(data.sentimentBreakdown.POSITIVE).toBeGreaterThanOrEqual(0);

    // Mode usage
    expect(data.modeUsage).toBeDefined();
    expect(typeof data.modeUsage.realtime).toBe("number");
    expect(typeof data.modeUsage.classic).toBe("number");

    // Tool metrics
    expect(data.toolCallCounts).toBeDefined();
    expect(typeof data.toolErrorRate).toBe("number");

    // Calls per day & histogram
    expect(Array.isArray(data.callsPerDay)).toBe(true);
    expect(data.callsPerDay.length).toBe(7);
    expect(Array.isArray(data.latencyHistogram)).toBe(true);

    // Recent calls (max 10, no real customer PII)
    expect(Array.isArray(data.recentCalls)).toBe(true);
    expect(data.recentCalls.length).toBeLessThanOrEqual(10);
    data.recentCalls.forEach((rc) => {
      expect(rc.id).toBeDefined();
      expect(rc.customerIntent).toBeDefined();
      expect(rc.resolutionStatus).toBeDefined();
      // Ensure no raw passwords or auth tokens leaked
      expect(rc.authToken).toBeUndefined();
    });
  });

  it("GET /api/insights returns 200 with JSON payload", async () => {
    const res = await insightsHandler();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.totalCalls).toBeGreaterThan(0);
  });
});
