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
  QA_SCHEMA,
  buildNullQAScorecard,
  validateAndSanitizeQAScorecard,
  buildDeterministicQAScorecard,
} from "@/lib/summary";
import { saveCallRecord, updateCallSummaryQa } from "@/lib/db";

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

/**
 * Task 17: Secondary structured-output call evaluating call quality, policy adherence,
 * empathy, conciseness, resolution effectiveness, unsupported promises, and coaching.
 */
async function callGeminiQA(transcript, toolEvents, summary = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const context = { transcript, toolEvents, summary };
  if (!apiKey) return buildDeterministicQAScorecard(context);

  const model = process.env.GEMINI_SUMMARY_MODEL || "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const transcriptText = Array.isArray(transcript) && transcript.length > 0
    ? transcript
        .map(
          (t) =>
            `[${t.timestamp || ""}] ${t.speaker === "user" ? "Customer" : "Aria"}: ${t.text || ""}`
        )
        .join("\n")
    : "No customer speech recorded.";

  const toolEventsText =
    toolEvents && toolEvents.length > 0
      ? toolEvents
          .map(
            (te) =>
              `- ${te.name}(args: ${JSON.stringify(te.args)}): result=${JSON.stringify(te.result)}`
          )
          .join("\n")
      : "No tools invoked.";

  const summaryText = summary?.call_summary || "Call concluded.";
  const resolutionText = summary?.resolution_status || "UNKNOWN";

  const prompt = `You are the Senior QA Auditor for Aura Skincare voice support.
Score this completed customer call 1 to 5 across 5 quality dimensions, check for any unsupported promises, and provide a single actionable coaching note.

BRAND POLICIES TO ENFORCE:
1. Cancellation: Allowed ONLY if status is "Processing". If "Shipped", "Out for Delivery", or "Delivered", cancellation MUST be declined (customer may refuse delivery at doorstep).
2. Returns: Allowed ONLY if status is "Delivered" AND delivered_days_ago <= 7. Unopened, unused packaging required.
3. Damaged/Defective: Must be reported within 48 hours of delivery with photos for replacement.
4. Shipping Fee: Free if order value > ₹499; ₹50 fee applies for orders ≤ ₹499.
5. Cash on Delivery (COD): Available only for orders up to ₹2,500.

EVALUATION CRITERIA:
1. policy_adherence (1-5): Did Aria strictly follow brand return, cancellation, and shipping guidelines?
2. accuracy_of_information (1-5): Were Aria's statements 100% grounded in tool results? Deduct heavily if she gave false statuses or unverified info.
3. empathy_and_tone (1-5): Warmth, patience, active listening, professional courtesy.
4. conciseness (1-5): Clear and brief without rambling or long monologues.
5. resolution_effectiveness (1-5): Did the customer receive a decisive outcome, helpful status, or clear next steps?
6. unsupported_promise_detected (boolean): Set to TRUE if Aria verbally guaranteed or promised any refund, delivery date, exception, or policy override NOT validated by tool execution or brand policy.
7. coaching_note (string): A single constructive, specific sentence of coaching guidance.

Call Summary: ${summaryText} (Resolution: ${resolutionText})

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
          responseSchema: QA_SCHEMA,
          temperature: 0.1,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[qa] Gemini API responded with ${res.status}`);
      return buildDeterministicQAScorecard(context);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return buildDeterministicQAScorecard(context);

    const parsed = JSON.parse(rawText);
    return validateAndSanitizeQAScorecard(parsed, context);
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[qa] Gemini QA scoring failed or timed out:", err?.message || err);
    return buildDeterministicQAScorecard(context);
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    // ── Non-blocking separate QA execution ──
    // Enables summary to appear first, and QA card loads in afterwards with a skeleton
    if (body.action === "qa" || body.step === "qa") {
      const { callId, transcript = [], toolEvents = [], summary = {} } = body;
      let qaScorecard;
      try {
        qaScorecard = await callGeminiQA(transcript, toolEvents, summary);
      } catch (err) {
        console.warn("[summary-route] QA call failed, using nulls:", err);
        qaScorecard = buildNullQAScorecard(err?.message);
      }

      if (callId) {
        await updateCallSummaryQa(callId, qaScorecard);
      }

      return NextResponse.json({
        ok: true,
        qa: qaScorecard,
        callId,
      });
    }

    const {
      sessionId = "default-session",
      mode = "realtime",
      transcript = [],
      toolEvents = [],
      metrics = {},
      startedAt = new Date().toISOString(),
      endedAt = new Date().toISOString(),
      resolution = null,
      includeQa = false,
    } = body;

    const context = { transcript, toolEvents, forcedResolution: resolution };

    // Check for abandoned call early
    const userTurns = Array.isArray(transcript)
      ? transcript.filter((t) => t.speaker === "user" && t.text && t.text.trim())
      : [];

    let summary;
    let source = "gemini";

    if (resolution === "ABANDONED" || userTurns.length === 0 || transcript.length < 2) {
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

    // Optional synchronous QA evaluation if requested
    let qaScorecard = null;
    if (includeQa) {
      try {
        qaScorecard = await callGeminiQA(transcript, toolEvents, summary);
        summary.qa = qaScorecard;
      } catch (qaErr) {
        console.warn("[summary] includeQa failed, using nulls:", qaErr);
        summary.qa = buildNullQAScorecard(qaErr?.message);
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
      qa: qaScorecard,
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
      qa: buildNullQAScorecard(err?.message),
      source: "emergency_fallback",
      error: err?.message,
    });
  }
}
