/**
 * app/api/insights/route.js — Public aggregated analytics endpoint
 *
 * GET /api/insights
 *
 * Aggregates from calls and tickets:
 * - total calls
 * - calls today
 * - avg duration
 * - avg response latency (p50 and p95)
 * - resolution status breakdown
 * - intent breakdown
 * - sentiment breakdown
 * - realtime-vs-classic usage
 * - tool-call counts
 * - tool error rate
 * - recent 10 calls (sanitized, no PII)
 */

import { NextResponse } from "next/server";
import { getInsightsData } from "@/lib/db";

export async function GET() {
  try {
    const data = await getInsightsData();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (err) {
    console.error("[insights] Error generating insights data:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to generate insights" },
      { status: 500 }
    );
  }
}
