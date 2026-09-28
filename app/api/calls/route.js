/**
 * app/api/calls/route.js — List session call history
 *
 * GET /api/calls?sessionId=...
 * Returns { ok: true, calls: [...] }
 */

import { NextResponse } from "next/server";
import { getCallsForSession, getAllRecentCalls } from "@/lib/db";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") || "default-session";
    const scope = searchParams.get("scope"); // "all" | "session"

    const sessionRes = await getCallsForSession(sessionId);
    const allRes = await getAllRecentCalls(50);

    const sessionCalls = sessionRes.calls || [];
    const allCalls = allRes.calls || [];

    // If scope === "all", return all calls
    // If scope === "session", return this session's calls
    // By default: return session calls if present, else fallback to all recent calls so user sees their calls
    const returnedCalls =
      scope === "all"
        ? allCalls
        : sessionCalls.length > 0
        ? sessionCalls
        : allCalls;

    return NextResponse.json({
      ok: true,
      sessionId,
      calls: returnedCalls,
      sessionCalls,
      allCalls,
    });
  } catch (err) {
    console.error("[calls] Error fetching call history:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch call history", calls: [], sessionCalls: [], allCalls: [] },
      { status: 500 }
    );
  }
}
