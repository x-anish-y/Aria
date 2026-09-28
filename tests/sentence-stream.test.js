import { describe, it, expect } from "vitest";
import {
  extractSentences,
  findBestSpeechSynthesisVoice,
} from "@/lib/audio/sentence-stream";

describe("lib/audio/sentence-stream.js — Sentence extraction & Voice selection", () => {
  describe("extractSentences", () => {
    it("returns empty array for empty or whitespace string", () => {
      expect(extractSentences("")).toEqual({ sentences: [], leftover: "" });
      expect(extractSentences("   ")).toEqual({ sentences: [], leftover: "" });
      expect(extractSentences(null)).toEqual({ sentences: [], leftover: "" });
    });

    it("splits standard sentences ending in period, exclamation, or question mark", () => {
      const input = "Hello there! How can I help you today? Please tell me.";
      const res = extractSentences(input, false);
      expect(res.sentences).toEqual([
        "Hello there!",
        "How can I help you today?",
        "Please tell me.",
      ]);
      expect(res.leftover).toBe("");
    });

    it("holds incomplete sentences in leftover when isFinal is false", () => {
      const input = "One moment, let me check that. Your order ORD-101 is";
      const res = extractSentences(input, false);
      expect(res.sentences).toEqual(["One moment, let me check that."]);
      expect(res.leftover).toBe("Your order ORD-101 is");
    });

    it("flushes leftover when isFinal is true", () => {
      const input = "One moment, let me check that. Your order ORD-101 is arriving soon";
      const res = extractSentences(input, true);
      expect(res.sentences).toEqual([
        "One moment, let me check that.",
        "Your order ORD-101 is arriving soon",
      ]);
      expect(res.leftover).toBe("");
    });

    it("does not prematurely split on common Indian/commercial abbreviations like Rs.", () => {
      const input = "The total value is Rs. 499 only. Would you like to proceed?";
      const res = extractSentences(input, false);
      expect(res.sentences).toEqual([
        "The total value is Rs. 499 only.",
        "Would you like to proceed?",
      ]);
    });
  });

  describe("findBestSpeechSynthesisVoice", () => {
    it("returns null when voice list is empty", () => {
      expect(findBestSpeechSynthesisVoice([])).toBeNull();
      expect(findBestSpeechSynthesisVoice(null)).toBeNull();
    });

    it("prioritizes Indian English voice over other English voices", () => {
      const voices = [
        { name: "Alex", lang: "en-US" },
        { name: "Veena", lang: "en-IN" },
        { name: "Daniel", lang: "en-GB" },
      ];
      const selected = findBestSpeechSynthesisVoice(voices);
      expect(selected?.name).toBe("Veena");
    });

    it("matches voice by name containing India or Indian", () => {
      const voices = [
        { name: "Google US English", lang: "en-US" },
        { name: "Microsoft Heera - English (India)", lang: "en" },
      ];
      const selected = findBestSpeechSynthesisVoice(voices);
      expect(selected?.name).toBe("Microsoft Heera - English (India)");
    });

    it("falls back to British English when Indian English is absent", () => {
      const voices = [
        { name: "Samantha", lang: "en-US" },
        { name: "George", lang: "en-GB" },
      ];
      const selected = findBestSpeechSynthesisVoice(voices);
      expect(selected?.name).toBe("George");
    });

    it("falls back to US English when British English is absent", () => {
      const voices = [
        { name: "Samantha", lang: "en-US" },
        { name: "Yuki", lang: "ja-JP" },
      ];
      const selected = findBestSpeechSynthesisVoice(voices);
      expect(selected?.name).toBe("Samantha");
    });
  });
});
