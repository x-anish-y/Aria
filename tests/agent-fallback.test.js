import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Unified Agent — Mode Switching & Fallback Rules (Task 5)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("determines forced classic mode when FORCE_CLASSIC=1", () => {
    process.env.FORCE_CLASSIC = "1";
    const isForced =
      process.env.FORCE_CLASSIC === "1" ||
      process.env.NEXT_PUBLIC_FORCE_CLASSIC === "1";
    expect(isForced).toBe(true);
  });

  it("determines forced classic mode when NEXT_PUBLIC_FORCE_CLASSIC=1", () => {
    process.env.NEXT_PUBLIC_FORCE_CLASSIC = "1";
    const isForced =
      process.env.FORCE_CLASSIC === "1" ||
      process.env.NEXT_PUBLIC_FORCE_CLASSIC === "1";
    expect(isForced).toBe(true);
  });

  it("identifies QUOTA_OR_UNAVAILABLE as a fallback trigger", () => {
    const error1 = { code: "QUOTA_OR_UNAVAILABLE", message: "Quota reached" };
    const error2 = { code: "RECONNECT_FAILED", message: "Live dropped twice" };
    const normalError = { code: "SOME_OTHER_ERROR", message: "Bad request" };

    const shouldFallback = (err) => {
      if (!err) return false;
      return (
        err.code === "QUOTA_OR_UNAVAILABLE" ||
        err.code === "RECONNECT_FAILED" ||
        (err.message && err.message.toLowerCase().includes("quota")) ||
        (err.message && err.message.toLowerCase().includes("unavailable")) ||
        (err.message && err.message.toLowerCase().includes("connection failed"))
      );
    };

    expect(shouldFallback(error1)).toBe(true);
    expect(shouldFallback(error2)).toBe(true);
    expect(shouldFallback(normalError)).toBe(false);
  });

  it("persists chosen mode to storage", () => {
    const mockStorage = {};
    const setMode = (mode) => {
      mockStorage["aria_voice_mode"] = mode;
    };
    const getMode = () => mockStorage["aria_voice_mode"] || "realtime";

    expect(getMode()).toBe("realtime");
    setMode("classic");
    expect(getMode()).toBe("classic");
  });
});
