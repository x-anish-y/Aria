/**
 * lib/audio/sentence-stream.js
 *
 * Sentence-level streaming and voice selection utilities for Classic voice mode.
 * Splits streaming LLM tokens into complete speakable sentences to reduce TTS perceived latency.
 */

const COMMON_ABBREVIATIONS = [
  "rs.",
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "vs.",
  "etc.",
  "e.g.",
  "i.e.",
  "ord.",
  "approx.",
  "no.",
  "vol.",
  "pm.",
  "am.",
];

/**
 * Extracts complete sentences from a streaming text buffer.
 * Preserves abbreviations (e.g., 'Rs.', 'ORD-101') from being erroneously split.
 *
 * @param {string} buffer - Current accumulated text buffer
 * @param {boolean} [isFinal=false] - Whether streaming has ended
 * @returns {{ sentences: string[], leftover: string }}
 */
export function extractSentences(buffer, isFinal = false) {
  if (!buffer || typeof buffer !== "string" || !buffer.trim()) {
    return { sentences: [], leftover: "" };
  }

  const sentences = [];
  const re = /([.!?]+|\n+)(?:\s+|$)/g;
  let match;
  let lastCut = 0;

  while ((match = re.exec(buffer)) !== null) {
    const boundaryIndex = match.index + match[1].length;
    const candidate = buffer.slice(lastCut, boundaryIndex).trim();
    const lower = candidate.toLowerCase();

    // Do not split if the candidate ends with a known abbreviation
    const isAbbreviation = COMMON_ABBREVIATIONS.some((abbr) =>
      lower.endsWith(abbr)
    );

    if (isAbbreviation) {
      continue;
    }

    if (candidate) {
      sentences.push(candidate);
    }
    lastCut = match.index + match[0].length;
  }

  const leftover = buffer.slice(lastCut);

  if (isFinal) {
    const finalChunk = leftover.trim();
    if (finalChunk) {
      sentences.push(finalChunk);
    }
    return { sentences, leftover: "" };
  }

  return { sentences, leftover };
}

/**
 * Selects the optimal Web Speech speechSynthesis voice.
 * Priority:
 * 1. Indian English ('en-IN', 'en_IN', or name contains 'India' / 'Hindi')
 * 2. British English ('en-GB')
 * 3. US English ('en-US')
 * 4. Any English ('en')
 * 5. Default voice
 *
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {SpeechSynthesisVoice|null}
 */
export function findBestSpeechSynthesisVoice(voices = []) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  // 1. Indian English
  const indianVoice = voices.find((v) => {
    const lang = (v.lang || "").toLowerCase();
    const name = (v.name || "").toLowerCase();
    return (
      lang === "en-in" ||
      lang === "en_in" ||
      name.includes("india") ||
      name.includes("indian") ||
      name.includes("hindi")
    );
  });
  if (indianVoice) return indianVoice;

  // 2. British English
  const britishVoice = voices.find((v) => {
    const lang = (v.lang || "").toLowerCase();
    return lang === "en-gb" || lang === "en_gb";
  });
  if (britishVoice) return britishVoice;

  // 3. US English
  const usVoice = voices.find((v) => {
    const lang = (v.lang || "").toLowerCase();
    return lang === "en-us" || lang === "en_us";
  });
  if (usVoice) return usVoice;

  // 4. Any English
  const anyEnglish = voices.find((v) => (v.lang || "").toLowerCase().startsWith("en"));
  if (anyEnglish) return anyEnglish;

  // 5. Default voice
  return voices.find((v) => v.default) || voices[0] || null;
}
