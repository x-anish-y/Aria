import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/chat/route";
import * as dbModule from "@/lib/db";
import * as toolsModule from "@/lib/tools";

describe("app/api/chat/route.js — Chat completions with tool calling & SSE", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "test-model";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 500 CONFIG_ERROR when GROQ_API_KEY is missing", async () => {
    delete process.env.GROQ_API_KEY;

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("CONFIG_ERROR");
  });

  it("returns 400 on invalid or missing messages", async () => {
    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("INVALID_REQUEST");
  });

  it("enforces rate limit when checkRateLimit returns allowed=false", async () => {
    vi.spyOn(dbModule, "checkRateLimit").mockResolvedValue({
      allowed: false,
      count: 61,
      limit: 60,
    });

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.168.1.100",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.code).toBe("RATE_LIMITED");
  });

  it("streams SSE tokens and returns toolEvents when tool is executed", async () => {
    vi.spyOn(dbModule, "checkRateLimit").mockResolvedValue({ allowed: true });

    // Mock getOrderDetails
    vi.spyOn(toolsModule, "getOrderDetails").mockResolvedValue({
      found: true,
      order: { order_id: "ORD-101", status: "Out for Delivery" },
    });

    // Mock Groq API calls:
    // Round 1: Returns tool_call for getOrderDetails
    // Round 2: Returns spoken text "Your order is out for delivery."
    let callCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
      callCount++;
      if (callCount === 1) {
        // Round 1: SSE stream with tool_call
        const sseStream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"getOrderDetails","arguments":"{\\"orderId\\":\\"ORD-101\\"}"}}]}}]}\n\n'
              )
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return Promise.resolve(new Response(sseStream, { status: 200 }));
      } else {
        // Round 2: SSE stream with content tokens
        const sseStream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"Your order "}}]}\n\n'
              )
            );
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"is out for delivery."}}]}\n\n'
              )
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return Promise.resolve(new Response(sseStream, { status: 200 }));
      }
    });

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Where is ORD-101?" }],
        sessionId: "test-sess-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    // Read full SSE body
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let bodyText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bodyText += decoder.decode(value);
    }

    expect(bodyText).toContain('"type":"tool_event"');
    expect(bodyText).toContain('"name":"getOrderDetails"');
    expect(bodyText).toContain('"token":"Your order "');
    expect(bodyText).toContain('"token":"is out for delivery."');
    expect(bodyText).toContain('"type":"done"');

    globalThis.fetch = originalFetch;
  });
});
