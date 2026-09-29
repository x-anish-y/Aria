import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SilenceTimer,
  SILENCE_NUDGE_MS,
  SILENCE_ABANDON_MS,
  isGoodbyeIntent,
  isUnclearAudioResponse,
} from "@/lib/call-etiquette";

describe("Call Etiquette — SilenceTimer State Machine (Task 15)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with stage 0 and inactive state", () => {
    const timer = new SilenceTimer({
      onNudge: vi.fn(),
      onAbandon: vi.fn(),
    });

    expect(timer.isActive()).toBe(false);
    expect(timer.isPaused()).toBe(false);
    expect(timer.getStage()).toBe(0);
  });

  it("fires onNudge after 8s of silence", () => {
    const onNudge = vi.fn();
    const onAbandon = vi.fn();
    const timer = new SilenceTimer({ onNudge, onAbandon });

    timer.start();
    expect(timer.isActive()).toBe(true);
    expect(timer.getStage()).toBe(0);

    // Advance 7.9s -> nudge not yet fired
    vi.advanceTimersByTime(7900);
    expect(onNudge).not.toHaveBeenCalled();
    expect(timer.getStage()).toBe(0);

    // Advance remaining 100ms -> 8s total
    vi.advanceTimersByTime(100);
    expect(onNudge).toHaveBeenCalledTimes(1);
    expect(timer.getStage()).toBe(1);
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it("fires onAbandon after 15s following the nudge (23s total)", () => {
    const onNudge = vi.fn();
    const onAbandon = vi.fn();
    const timer = new SilenceTimer({ onNudge, onAbandon });

    timer.start();

    // 8s -> Nudge
    vi.advanceTimersByTime(SILENCE_NUDGE_MS);
    expect(onNudge).toHaveBeenCalledTimes(1);
    expect(timer.getStage()).toBe(1);

    // 14.9s after nudge -> abandon not yet fired
    vi.advanceTimersByTime(SILENCE_ABANDON_MS - 100);
    expect(onAbandon).not.toHaveBeenCalled();

    // 15s after nudge -> Abandon
    vi.advanceTimersByTime(100);
    expect(onAbandon).toHaveBeenCalledTimes(1);
    expect(timer.getStage()).toBe(2);
  });

  it("resets 8s timer when customer speaks before nudge", () => {
    const onNudge = vi.fn();
    const onAbandon = vi.fn();
    const timer = new SilenceTimer({ onNudge, onAbandon });

    timer.start();

    // 5s of silence, then customer speaks
    vi.advanceTimersByTime(5000);
    expect(onNudge).not.toHaveBeenCalled();

    // Customer speech starts -> reset()
    timer.reset();

    // Advance another 5s (10s total since start, but only 5s since reset)
    vi.advanceTimersByTime(5000);
    expect(onNudge).not.toHaveBeenCalled();

    // Advance 3s more (8s since reset) -> now nudge fires
    vi.advanceTimersByTime(3000);
    expect(onNudge).toHaveBeenCalledTimes(1);
    expect(timer.getStage()).toBe(1);
  });

  it("resets back to stage 0 if customer speaks after nudge (during abandon countdown)", () => {
    const onNudge = vi.fn();
    const onAbandon = vi.fn();
    const timer = new SilenceTimer({ onNudge, onAbandon });

    timer.start();

    // 8s -> Nudge fired
    vi.advanceTimersByTime(SILENCE_NUDGE_MS);
    expect(onNudge).toHaveBeenCalledTimes(1);
    expect(timer.getStage()).toBe(1);

    // 10s after nudge, customer responds or barges in!
    vi.advanceTimersByTime(10000);
    timer.reset();

    // Verify stage reset to 0
    expect(timer.getStage()).toBe(0);

    // Advance 10s more -> abandoned should NOT fire because timer reset to 8s nudge
    vi.advanceTimersByTime(10000);
    expect(onAbandon).not.toHaveBeenCalled();
    // In fact, nudge fired again after 8s of the new silence
    expect(onNudge).toHaveBeenCalledTimes(2);
  });

  it("pauses while mic is muted or agent is speaking, never firing", () => {
    const onNudge = vi.fn();
    const onAbandon = vi.fn();
    const timer = new SilenceTimer({ onNudge, onAbandon });

    timer.start();

    // 4s elapsed
    vi.advanceTimersByTime(4000);

    // Mic is muted or agent begins speaking -> pause()
    timer.pause();
    expect(timer.isPaused()).toBe(true);

    // 30 seconds pass while paused
    vi.advanceTimersByTime(30000);
    expect(onNudge).not.toHaveBeenCalled();
    expect(onAbandon).not.toHaveBeenCalled();

    // Agent finishes / mic unmuted -> resume()
    timer.resume();
    expect(timer.isPaused()).toBe(false);

    // 8s after resume -> nudge fires
    vi.advanceTimersByTime(SILENCE_NUDGE_MS);
    expect(onNudge).toHaveBeenCalledTimes(1);
  });

  it("stop() cancels all timers and marks inactive", () => {
    const onNudge = vi.fn();
    const onAbandon = vi.fn();
    const timer = new SilenceTimer({ onNudge, onAbandon });

    timer.start();
    vi.advanceTimersByTime(5000);

    timer.stop();
    expect(timer.isActive()).toBe(false);
    expect(timer.getStage()).toBe(0);

    // Advance large time window
    vi.advanceTimersByTime(60000);
    expect(onNudge).not.toHaveBeenCalled();
    expect(onAbandon).not.toHaveBeenCalled();
  });
});

describe("Call Etiquette — Goodbye Intent Detection", () => {
  it("detects common English goodbye / closing phrases", () => {
    expect(isGoodbyeIntent("that's all")).toBe(true);
    expect(isGoodbyeIntent("thats all")).toBe(true);
    expect(isGoodbyeIntent("that is all")).toBe(true);
    expect(isGoodbyeIntent("thanks bye")).toBe(true);
    expect(isGoodbyeIntent("thank you, bye!")).toBe(true);
    expect(isGoodbyeIntent("okay bye bye")).toBe(true);
    expect(isGoodbyeIntent("nothing else, thanks")).toBe(true);
    expect(isGoodbyeIntent("no that's all for today")).toBe(true);
    expect(isGoodbyeIntent("have a good day")).toBe(true);
  });

  it("detects Hinglish / Hindi goodbye phrases", () => {
    expect(isGoodbyeIntent("bas itna hi")).toBe(true);
    expect(isGoodbyeIntent("sab theek hai bye")).toBe(true);
    expect(isGoodbyeIntent("chalo bye")).toBe(true);
    expect(isGoodbyeIntent("alvida")).toBe(true);
  });

  it("does not falsely trigger on continuing queries", () => {
    expect(isGoodbyeIntent("Can you track ORD-101?")).toBe(false);
    expect(isGoodbyeIntent("How much is shipping to Mumbai?")).toBe(false);
    expect(isGoodbyeIntent("Yes please proceed")).toBe(false);
    expect(isGoodbyeIntent("I want to return an item")).toBe(false);
    expect(isGoodbyeIntent("")).toBe(false);
    expect(isGoodbyeIntent(null)).toBe(false);
  });
});

describe("Call Etiquette — Unclear Audio Detection", () => {
  it("identifies model prompts asking to repeat or clarify", () => {
    expect(isUnclearAudioResponse("I didn't quite catch that, could you repeat?")).toBe(true);
    expect(isUnclearAudioResponse("Could you please repeat that?")).toBe(true);
    expect(isUnclearAudioResponse("Pardon? Can you say that again?")).toBe(true);
    expect(isUnclearAudioResponse("Sorry, what did you say?")).toBe(true);
    expect(isUnclearAudioResponse("Could you speak a bit louder?")).toBe(true);
    expect(isUnclearAudioResponse("Your voice is breaking, could you say that again?")).toBe(true);
  });

  it("does not falsely trigger on normal helpful responses", () => {
    expect(isUnclearAudioResponse("Sure, I can help you check your order ORD-101.")).toBe(false);
    expect(isUnclearAudioResponse("Your return window has expired for this order.")).toBe(false);
    expect(isUnclearAudioResponse("Shall I go ahead and cancel order ORD-103?")).toBe(false);
    expect(isUnclearAudioResponse("")).toBe(false);
  });
});
