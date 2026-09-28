import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/token/route";
import { clearRateLimits } from "@/lib/db";

describe("app/api/token/route.js — Ephemeral Token Minting", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearRateLimits();
    vi.restoreAllMocks();
  });

  it("returns CONFIG_ERROR when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    const req = new Request("http://localhost:3000/api/token", { method: "POST" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("CONFIG_ERROR");
    expect(body.error).toContain("GEMINI_API_KEY");
  });

  it("successfully mints ephemeral token and returns token and model", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "auth_tokens/mock-token-uuid-12345",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new Request("http://localhost:3000/api/token", {
      method: "POST",
      headers: { "x-forwarded-for": "192.168.1.100" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token).toBe("auth_tokens/mock-token-uuid-12345");
    expect(body.model).toBe("gemini-2.5-flash-native-audio-preview-12-2025");
  });

  it("works with GET requests as well", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "auth_tokens/get-mock-token",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new Request("http://localhost:3000/api/token", {
      method: "GET",
      headers: { "x-forwarded-for": "192.168.1.101" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token).toBe("auth_tokens/get-mock-token");
  });

  it("returns QUOTA_OR_UNAVAILABLE when upstream Gemini service responds with 429", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            message: "Resource has been exhausted",
            status: "RESOURCE_EXHAUSTED",
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new Request("http://localhost:3000/api/token", {
      method: "POST",
      headers: { "x-forwarded-for": "192.168.1.102" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("QUOTA_OR_UNAVAILABLE");
    expect(body.error).toContain("quota");
  });

  it("enforces rate limit when multiple requests exceed threshold from the same IP", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            name: "auth_tokens/mock-token",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const clientIp = "10.0.0.50";
    let lastRes;

    // Send 21 requests (limit is 20)
    for (let i = 0; i < 21; i++) {
      const req = new Request("http://localhost:3000/api/token", {
        method: "POST",
        headers: { "x-forwarded-for": clientIp },
      });
      lastRes = await POST(req);
    }

    expect(lastRes.status).toBe(429);
    const body = await lastRes.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(lastRes.headers.get("Retry-After")).toBe("60");
  });
});
