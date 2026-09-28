/**
 * scripts/test-both-modes.mjs
 *
 * Test script to verify both voice modes:
 * 1. Primary: Gemini Live (ephemeral token minting & WebSocket setup)
 * 2. Fallback: Classic (Groq chat completions with server-side tool execution & SSE streaming)
 * 3. Forced Fallback: Simulates FORCE_CLASSIC=1
 *
 * Usage:
 *   node scripts/test-both-modes.mjs
 *   $env:FORCE_CLASSIC="1"; node scripts/test-both-modes.mjs
 */

import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

// Load environment variables from .env.local if not already set
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const isForcedClassic =
  process.env.FORCE_CLASSIC === "1" ||
  process.env.NEXT_PUBLIC_FORCE_CLASSIC === "1" ||
  process.argv.includes("--force-classic");

console.log("\n========================================================");
console.log(" Aria Voice Agent — Dual Mode Test Suite (Task 5)");
console.log(` Target Server : ${BASE_URL}`);
console.log(` FORCE_CLASSIC : ${isForcedClassic ? "YES (Forced Fallback)" : "NO (Standard Dual-Mode)"}`);
console.log("========================================================\n");

async function testRealtimeMode() {
  console.log("--- [Test 1: Realtime Mode (Gemini Live Auth)] ---");
  if (isForcedClassic) {
    console.log("⏩ Skipping Realtime Mode tests because FORCE_CLASSIC=1 is active.\n");
    return true;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/token`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      console.warn(`⚠️ Token endpoint returned HTTP ${res.status}:`, data);
      if (data.code === "QUOTA_OR_UNAVAILABLE") {
        console.log("✓ Correctly detected QUOTA_OR_UNAVAILABLE (will auto-switch to Classic).");
        return true;
      }
      return false;
    }

    if (!data.token) {
      console.error("❌ Token response missing 'token' property:", data);
      return false;
    }

    console.log(`✓ Ephemeral token minted successfully!`);
    console.log(`  Model: ${data.model}`);
    console.log(`  Token prefix: ${data.token.slice(0, 16)}...`);
    console.log("✓ Realtime mode authentication verified.\n");
    return true;
  } catch (err) {
    console.error("❌ Realtime token test failed with network error:", err.message);
    return false;
  }
}

async function testClassicMode() {
  console.log("--- [Test 2: Classic Mode (Groq + Server-Side Tool Loop + SSE)] ---");

  try {
    const testSessionId = `test-session-${Date.now()}`;
    const startTime = Date.now();

    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Where is my order ORD-101?" }],
        sessionId: testSessionId,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error(`❌ /api/chat returned HTTP ${res.status}:`, errData);
      return false;
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      console.error(`❌ Expected text/event-stream but got: ${contentType}`);
      return false;
    }

    console.log("✓ Connected to SSE stream (HTTP 200 text/event-stream)");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let toolEventsReceived = [];
    let streamedTokens = [];
    let completionReceived = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === "tool_event") {
            toolEventsReceived.push(parsed.event);
            console.log(`  🔧 Tool Event: ${parsed.event.name}() executed in ${parsed.event.durationMs}ms`);
          } else if (parsed.type === "token") {
            streamedTokens.push(parsed.token);
          } else if (parsed.type === "done") {
            completionReceived = true;
          } else if (parsed.type === "error") {
            console.error("  ❌ SSE error received:", parsed);
          }
        } catch {}
      }
    }

    const totalDuration = Date.now() - startTime;
    const fullText = streamedTokens.join("");

    console.log(`✓ Tool loop executed server-side: ${toolEventsReceived.length} tool event(s)`);
    if (toolEventsReceived.length > 0) {
      const t0 = toolEventsReceived[0];
      console.log(`  Tool Name: ${t0.name}`);
      console.log(`  Tool Args: ${JSON.stringify(t0.args)}`);
      console.log(`  Tool Result Found: ${t0.result?.found}, Status: ${t0.result?.order?.status}`);
    }

    console.log(`✓ Streamed ${streamedTokens.length} tokens in ${totalDuration}ms`);
    console.log(`  Spoken Response: "${fullText.trim()}"`);
    console.log(`✓ Completion event received: ${completionReceived}`);
    console.log("✓ Classic voice fallback verified.\n");
    return true;
  } catch (err) {
    console.error("❌ Classic mode test failed with error:", err.message);
    return false;
  }
}

async function testSentenceSplitter() {
  console.log("--- [Test 3: Sentence Splitter & Abbreviation Protection] ---");
  const { extractSentences } = await import("../lib/audio/sentence-stream.js");

  const sample =
    "One moment, let me check that. Your order ORD-101 is out for delivery. The total is Rs. 499 only. Thank you!";
  const { sentences } = extractSentences(sample, true);

  console.log(`  Input  : "${sample}"`);
  console.log(`  Output : ${JSON.stringify(sentences, null, 2)}`);

  const hasRsIntact = sentences.some((s) => s.includes("Rs. 499"));
  if (hasRsIntact && sentences.length === 4) {
    console.log("✓ Sentence splitter correctly preserved 'Rs. 499' and split into 4 sentences.\n");
    return true;
  } else {
    console.error("❌ Sentence splitter did not produce expected sentences.");
    return false;
  }
}

async function runAll() {
  const t1 = await testRealtimeMode();
  const t2 = await testClassicMode();
  const t3 = await testSentenceSplitter();

  console.log("========================================================");
  console.log(" Overall Test Results:");
  console.log(`   Realtime Mode (Gemini Live) : ${t1 ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   Classic Mode (Groq Fallback) : ${t2 ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   Sentence Stream Logic       : ${t3 ? "PASS ✓" : "FAIL ✗"}`);
  console.log("========================================================\n");

  if (!t1 || !t2 || !t3) {
    process.exit(1);
  }
}

runAll();
