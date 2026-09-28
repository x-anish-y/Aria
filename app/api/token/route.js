/**
 * app/api/token/route.js — Mint short-lived ephemeral token for Gemini Live WebSocket session
 *
 * Rules:
 * - GEMINI_API_KEY is server-side ONLY (never exposed to client)
 * - Mints short-lived token via POST https://generativelanguage.googleapis.com/v1beta/auth_tokens
 * - Returns { token, model } on success
 * - Returns { error, code } on error, specifically QUOTA_OR_UNAVAILABLE on quota/upstream failures
 * - IP rate limit enforced via rate_limits table (with in-memory fallback)
 */

import dns from "node:dns";
import { checkRateLimit } from "@/lib/db";

// Ensure IPv4 is prioritized to prevent connect timeout errors on Windows/Node
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

export async function GET(request) {
  return handleTokenMinting(request);
}

export async function POST(request) {
  return handleTokenMinting(request);
}

async function handleTokenMinting(request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error: "GEMINI_API_KEY environment variable is not configured on the server.",
          code: "CONFIG_ERROR",
        },
        { status: 500 }
      );
    }

    // Resolve client IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded ? forwarded.split(",")[0].trim() : realIp || "127.0.0.1";

    // Rate limit: max 20 token mints per 60s window per IP
    const rateCheck = await checkRateLimit(`token:${ip}`, 20, 60);
    if (!rateCheck.allowed) {
      return Response.json(
        {
          error: "Rate limit exceeded. Please wait a moment before opening a new live session.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
          },
        }
      );
    }

    const model =
      process.env.GEMINI_LIVE_MODEL ||
      "gemini-2.5-flash-native-audio-preview-12-2025";

    // Call Gemini API to create an ephemeral auth token
    const tokenEndpoint =
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

    let geminiRes;
    try {
      geminiRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          uses: 1,
        }),
      });
    } catch (networkErr) {
      console.error("[api/token] Upstream network fetch failed:", networkErr);
      return Response.json(
        {
          error: "Failed to connect to Gemini API service.",
          code: "QUOTA_OR_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      console.warn(
        `[api/token] Gemini auth_tokens returned HTTP ${geminiRes.status}:`,
        errBody
      );

      const status = geminiRes.status;
      const isQuotaOrUnavailable =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        errBody?.error?.status === "RESOURCE_EXHAUSTED" ||
        errBody?.error?.code === 429;

      if (isQuotaOrUnavailable) {
        return Response.json(
          {
            error:
              "Gemini Live service quota reached or service temporarily unavailable.",
            code: "QUOTA_OR_UNAVAILABLE",
          },
          { status: 503 }
        );
      }

      return Response.json(
        {
          error:
            errBody?.error?.message ||
            `Failed to mint ephemeral token (HTTP ${status}).`,
          code: "TOKEN_GENERATION_FAILED",
        },
        { status: geminiRes.status }
      );
    }

    const data = await geminiRes.json();
    const token = data?.name;

    if (!token) {
      return Response.json(
        {
          error: "Gemini API responded without an auth token name.",
          code: "TOKEN_GENERATION_FAILED",
        },
        { status: 502 }
      );
    }

    return Response.json(
      {
        token,
        model,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/token] Unhandled error:", err);
    return Response.json(
      {
        error: err?.message || "Internal server error while minting token.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
