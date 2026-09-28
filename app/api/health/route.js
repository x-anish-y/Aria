/**
 * app/api/health/route.js — Health and status endpoint
 *
 * Checks database connectivity, provider reachability (Gemini & Groq), and exposed models.
 */

import { safeQuery, isDegraded } from "@/lib/db";

export async function GET() {
  try {
    // 1. Check Neon DB
    let dbConnected = false;
    let dbStatus = "connected";
    const dbCheck = await safeQuery`SELECT 1 as alive`;
    if (dbCheck.ok && !isDegraded) {
      dbConnected = true;
    } else {
      dbStatus = isDegraded ? "in-memory fallback" : "unreachable";
    }

    // 2. Check Provider Reachability (Lightweight non-blocking ping with 3s timeout)
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    let liveReady = false;
    let geminiStatus = "unconfigured";
    if (geminiKey) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
          { signal: AbortSignal.timeout(3000) }
        );
        geminiStatus = geminiRes.ok ? "reachable" : `error_${geminiRes.status}`;
        liveReady = geminiRes.ok;
      } catch (err) {
        geminiStatus = "unreachable";
      }
    }

    let classicReady = false;
    let groqStatus = "unconfigured";
    if (groqKey) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${groqKey}` },
          signal: AbortSignal.timeout(3000),
        });
        groqStatus = groqRes.ok ? "reachable" : `error_${groqRes.status}`;
        classicReady = groqRes.ok;
      } catch (err) {
        groqStatus = "unreachable";
      }
    }

    const degraded = !dbConnected || !liveReady || isDegraded;

    return Response.json(
      {
        db: dbConnected,
        live: liveReady,
        classic: classicReady,
        degraded,
        status: "ok",
        database: dbStatus,
        mode: isDegraded ? "in-memory fallback" : "neon postgres",
        providers: {
          neon: dbStatus,
          gemini: geminiStatus,
          groq: groqStatus,
        },
        models: {
          gemini_live: process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025",
          gemini_summary: process.env.GEMINI_SUMMARY_MODEL || "gemini-2.5-flash",
          groq: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    return Response.json(
      {
        db: false,
        live: false,
        classic: false,
        degraded: true,
        status: "error",
        error: err?.message || "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
