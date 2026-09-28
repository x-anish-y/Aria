/**
 * app/api/summary/route.js — Post-call summary evaluation and persistence
 *
 * Requirements:
 * 1. Input: { sessionId, mode, transcript, toolEvents, metrics, startedAt, endedAt }
 * 2. Structured JSON output schema:
 *    {
 *      customer_intent: ORDER_TRACKING | CANCELLATION | RETURN_REFUND | SHIPPING_INFO | COD_INFO | PRODUCT_INFO | COMPLAINT | OUT_OF_SCOPE | OTHER,
 *      order_id: string | null,
 *      resolution_status: RESOLVED | UNRESOLVED | ESCALATION_NEEDED | POLICY_DECLINED | ABANDONED,
 *      call_summary: 1-3 sentences,
 *      policy_notes: string | null,
 *      customer_sentiment: POSITIVE | NEUTRAL | NEGATIVE,
 *      actions_taken: string[]
 *    }
 * 3. Ground order_id, actions_taken, and outcomes in toolEvents.
 * 4. Deterministic fallback if LLM fails, returns invalid JSON, or call is abandoned.
 * 5. Persist to calls table without blocking UI on failure.
 */

import { NextResponse } from "next/server";
import {
  buildDeterministicSummary,
  validateAndSanitizeSummary,
} from "@/lib/summary";
import { saveCallRecord } from "@/lib/db";

const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: {
    customer_intent: {
      type: "STRING",
      enum: [
        "ORDER_TRACKING",
        "CANCELLATION",
        "RETURN_REFUND",
        "SHIPPING_INFO",
        "COD_INFO",
        "PRODUCT_INFO",
        "COMPLAINT",
        "OUT_OF_SCOPE",
        "OTHER",
      ],
    },
    order_id: { type: "STRING", nullable: true },
    resolution_status: {
      type: "STRING",
      enum: [
        "RESOLVED",
        "UNRESOLVED",
        "ESCALATION_NEEDED",
        "POLICY_DECLINED",
        "ABANDONED",
      ],
    },
    call_summary: { type: "STRING" },
    policy_notes: { type: "STRING", nullable: true },
    customer_sentiment: {
      type: "STRING",
      enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"],
    },
    actions_taken: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: [
    "customer_intent",
    "resolution_status",
    "call_summary",
    "customer_sentiment",
    "actions_taken",
  ],
};

async function callGeminiSummary(transcript, toolEvents) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_SUMMARY_MODEL || "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const transcriptText = transcript
    .map(
      (t) =>
        `[${t.timestamp || ""}] ${t.speaker === "user" ? "Customer" : "Aria"}: ${t.text || ""}`
    )
    .join("\n");

  const toolEventsText =
    toolEvents && toolEvents.length > 0
      ? toolEvents
          .map(
            (te) =>
              `- ${te.name}(args: ${JSON.stringify(te.args)}): result=${JSON.stringify(te.result)}`
          )
          .join("\n")
      : "No tools invoked.";

  const prompt = `You are the lead QA evaluator for Aura Skincare customer support.
Analyze the following completed customer call and generate a structured JSON evaluation.

CRITICAL INSTRUCTIONS:
1. Ground order_id, actions_taken, and outcomes strictly in toolEvents. Do NOT invent or guess order IDs or tool executions.
2. If order status is Processing, cancellation is permitted. If Shipped or Delivered, direct cancellation must be declined.
3. If delivery was > 7 days ago or items are opened, returns must be declined.
4. If a support ticket was filed, resolution_status must be ESCALATION_NEEDED.
5. If call ended before the user gave an inquiry or had fewer than 2 turns, resolution_status must be ABANDONED.
6. call_summary must be 1 to 3 concise, factual sentences.

Transcript:
${transcriptText}

Tool Events:
${toolEventsText}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SUMMARY_SCHEMA,
          temperature: 0.1,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[summary] Gemini API responded with ${res.status}`);
      return null;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    return JSON.parse(rawText);
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[summary] Gemini request failed or timed out:", err?.message || err);
    return null;
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      sessionId = "default-session",
      mode = "realtime",
      transcript = [],
      toolEvents = [],
      metrics = {},
      startedAt = new Date().toISOString(),
      endedAt = new Date().toISOString(),
    } = body;

    const context = { transcript, toolEvents };

    // Check for abandoned call early
    const userTurns = Array.isArray(transcript)
      ? transcript.filter((t) => t.speaker === "user" && t.text && t.text.trim())
      : [];

    let summary;
    let source = "gemini";

    if (userTurns.length === 0 || transcript.length < 2) {
      summary = buildDeterministicSummary(context);
      source = "deterministic_abandoned";
    } else {
      const rawGemini = await callGeminiSummary(transcript, toolEvents);
      if (rawGemini) {
        summary = validateAndSanitizeSummary(rawGemini, context);
      } else {
        summary = buildDeterministicSummary(context);
        source = "deterministic_fallback";
      }
    }

    // Calculate duration in seconds
    const startMs = new Date(startedAt).getTime() || Date.now();
    const endMs = new Date(endedAt).getTime() || Date.now();
    const durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));

    // Persist every call to calls table (must NOT block or fail the UI)
    let callRecordId = null;
    try {
      const persistRes = await saveCallRecord({
        sessionId,
        mode,
        startedAt,
        endedAt,
        durationSeconds,
        transcript,
        toolEvents,
        summary,
        metrics,
      });
      callRecordId = persistRes?.id || null;
    } catch (persistErr) {
      console.error("[summary] Failed to persist call record:", persistErr?.message || persistErr);
    }

    return NextResponse.json({
      ok: true,
      summary,
      source,
      callId: callRecordId,
      persisted: Boolean(callRecordId),
    });
  } catch (err) {
    console.error("[summary] Route handler error:", err);
    // Even on total route catastrophe, guarantee a valid summary object
    const fallback = buildDeterministicSummary({});
    return NextResponse.json({
      ok: true,
      summary: fallback,
      source: "emergency_fallback",
      error: err?.message,
    });
  }
}
