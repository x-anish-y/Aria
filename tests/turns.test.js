import { describe, it, expect } from "vitest";

/**
 * Pure turn merging function used in dev page and voice mode
 */
export function mergeTurnFragments(turns, speaker, fragment, options = {}) {
  const clean = String(fragment || "").trim();
  if (!clean && !options.force) {
    if (options.complete && turns.length > 0) {
      const last = turns[turns.length - 1];
      if (last.speaker === speaker) {
        return [
          ...turns.slice(0, -1),
          { ...last, isComplete: true, isInterrupted: options.interrupted || last.isInterrupted },
        ];
      }
    }
    return turns;
  }

  const lastIndex = turns.length - 1;
  const lastTurn = lastIndex >= 0 ? turns[lastIndex] : null;

  if (lastTurn && lastTurn.speaker === speaker && !lastTurn.isComplete) {
    const separator = lastTurn.text.endsWith(" ") || clean.startsWith(" ") ? "" : " ";
    const updatedText = `${lastTurn.text}${separator}${clean}`.replace(/\s+/g, " ").trim();
    const updated = {
      ...lastTurn,
      text: updatedText,
      isComplete: options.complete ?? lastTurn.isComplete,
      isInterrupted: options.interrupted || lastTurn.isInterrupted,
    };
    const next = [...turns];
    next[lastIndex] = updated;
    return next;
  }

  if (!clean) return turns;

  return [
    ...turns,
    {
      id: "turn-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      speaker,
      text: clean,
      timestamp: options.timestamp || "12:00:00 PM",
      isComplete: Boolean(options.complete),
      isInterrupted: Boolean(options.interrupted),
    },
  ];
}

describe("Turn merging logic (Task 4c)", () => {
  it("creates a new turn for the first fragment", () => {
    const initial = [];
    const res = mergeTurnFragments(initial, "user", "Where is", { timestamp: "10:00:00 AM" });
    expect(res).toHaveLength(1);
    expect(res[0].speaker).toBe("user");
    expect(res[0].text).toBe("Where is");
    expect(res[0].isComplete).toBe(false);
  });

  it("merges sequential streaming fragments into the same turn", () => {
    let turns = mergeTurnFragments([], "user", "Where is");
    turns = mergeTurnFragments(turns, "user", "ORD-101?");
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Where is ORD-101?");
    expect(turns[0].isComplete).toBe(false);
  });

  it("marks turn as complete when turnComplete signal is received", () => {
    let turns = mergeTurnFragments([], "user", "Hello");
    turns = mergeTurnFragments(turns, "user", "", { complete: true });
    expect(turns).toHaveLength(1);
    expect(turns[0].isComplete).toBe(true);

    // Subsequent fragment starts a new turn
    turns = mergeTurnFragments(turns, "user", "Where is my order?");
    expect(turns).toHaveLength(2);
    expect(turns[1].text).toBe("Where is my order?");
  });

  it("creates a separate turn when the speaker changes", () => {
    let turns = mergeTurnFragments([], "user", "Where is ORD-101?");
    turns = mergeTurnFragments(turns, "aria", "One moment, let me check that.");
    expect(turns).toHaveLength(2);
    expect(turns[0].speaker).toBe("user");
    expect(turns[1].speaker).toBe("aria");
  });

  it("marks assistant turn as interrupted when barge-in happens", () => {
    let turns = mergeTurnFragments([], "aria", "Your order ORD-101 is currently out for delivery...");
    turns = mergeTurnFragments(turns, "aria", "", { complete: true, interrupted: true });
    expect(turns).toHaveLength(1);
    expect(turns[0].isInterrupted).toBe(true);
  });

  it("never creates empty tool-only turns", () => {
    let turns = mergeTurnFragments([], "aria", "   ");
    expect(turns).toHaveLength(0);
    turns = mergeTurnFragments(turns, "user", "");
    expect(turns).toHaveLength(0);
  });
});
