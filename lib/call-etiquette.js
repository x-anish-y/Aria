/**
 * lib/call-etiquette.js — Call Etiquette, Silence Handling & Goodbye Intent Engine
 *
 * Requirements (Task 15):
 * 1. Silence handling:
 *    - After 8s of no customer speech while listening, Aria sends a short "Are you still there?" nudge.
 *    - After 15 more seconds of silence, she says a polite goodbye and the call ends with resolution ABANDONED.
 *    - Client-side timer that sends a text nudge to the model.
 *    - Reset on any speech or barge-in.
 *    - Never fire while agent is speaking, a tool is running, or mic is muted.
 * 2. Unclear audio detection:
 *    - Low confidence speech recognition (Classic) or unintelligible model repetitions.
 * 3. Natural closing detection:
 *    - Detects goodbye intents ("that's all", "thanks bye", etc.) from transcript.
 *    - Triggers auto-end with 2-second grace period after agent closing finishes.
 */

export const SILENCE_NUDGE_MS = 8000; // 8 seconds
export const SILENCE_ABANDON_MS = 15000; // 15 seconds after nudge (23s total)
export const GOODBYE_AUTO_END_DELAY_MS = 2000; // 2 seconds grace period

/**
 * Regex patterns for natural goodbye / closing intents
 */
export const GOODBYE_PATTERNS = [
  /\b(that'?s all|thats all|that is all)\b/i,
  /\b(thanks?|thank you),?\s*(bye|goodbye|cya)\b/i,
  /\b(bye bye|goodbye|bye aria|ok bye|okay bye)\b/i,
  /\b(nothing else|no nothing else|no that'?s all|no that is all)\b/i,
  /\b(sab theek hai bye|bas itna hi|alvida|chalo bye)\b/i,
  /\b(have a good (day|night|evening)|take care,?\s*bye)\b/i,
];

/**
 * Regex patterns for unclear audio / request to repeat
 */
export const UNCLEAR_AUDIO_PATTERNS = [
  /\b(didn'?t (quite )?(catch|hear)|could you (please )?repeat|say that again|pardon|sorry,?\s*(what did you say|could you repeat))\b/i,
  /\b(didn'?t get that|can you repeat that|could you speak a bit louder)\b/i,
  /\b(unable to hear|could you please rephrase|voice is breaking)\b/i,
];

/**
 * Pure function to check if a user turn contains a goodbye intent
 * @param {string} text
 * @returns {boolean}
 */
export function isGoodbyeIntent(text = "") {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim().toLowerCase();
  return GOODBYE_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * Pure function to check if model response is asking customer to repeat
 * @param {string} text
 * @returns {boolean}
 */
export function isUnclearAudioResponse(text = "") {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim().toLowerCase();
  return UNCLEAR_AUDIO_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * Client-Side Silence Timer State Machine
 *
 * Coordinates:
 * - Stage 0: Active listening, 8s timer running
 * - Stage 1: 8s elapsed -> onNudge() called, 15s abandon timer running
 * - Stage 2: 15s elapsed -> onAbandon() called
 * - Resets on any speech or barge-in
 * - Pauses when mic is muted or agent is speaking / thinking
 */
export class SilenceTimer {
  constructor({
    onNudge,
    onAbandon,
    nudgeDelayMs = SILENCE_NUDGE_MS,
    abandonDelayMs = SILENCE_ABANDON_MS,
  } = {}) {
    this.onNudge = onNudge;
    this.onAbandon = onAbandon;
    this.nudgeDelayMs = nudgeDelayMs;
    this.abandonDelayMs = abandonDelayMs;

    this.nudgeTimer = null;
    this.abandonTimer = null;
    this.stage = 0; // 0 = idle, 1 = nudged, 2 = abandoned
    this.active = false;
    this.paused = false;
  }

  /**
   * Start or restart silence monitoring
   */
  start() {
    this.stop();
    this.active = true;
    this.paused = false;
    this.stage = 0;
    this._scheduleNudge();
  }

  _scheduleNudge() {
    if (this.nudgeTimer) {
      clearTimeout(this.nudgeTimer);
      this.nudgeTimer = null;
    }
    if (!this.active || this.paused) return;

    this.nudgeTimer = setTimeout(() => {
      this.stage = 1;
      this.nudgeTimer = null;
      if (typeof this.onNudge === "function") {
        this.onNudge();
      }
      this._scheduleAbandon();
    }, this.nudgeDelayMs);
  }

  _scheduleAbandon() {
    if (this.abandonTimer) {
      clearTimeout(this.abandonTimer);
      this.abandonTimer = null;
    }
    if (!this.active || this.paused) return;

    this.abandonTimer = setTimeout(() => {
      this.stage = 2;
      this.abandonTimer = null;
      if (typeof this.onAbandon === "function") {
        this.onAbandon();
      }
    }, this.abandonDelayMs);
  }

  /**
   * Reset on any speech activity or barge-in
   */
  reset() {
    if (!this.active) return;
    this.stage = 0;
    if (this.abandonTimer) {
      clearTimeout(this.abandonTimer);
      this.abandonTimer = null;
    }
    if (!this.paused) {
      this._scheduleNudge();
    }
  }

  /**
   * Pause timers when agent is speaking, tool is executing, or mic is muted
   */
  pause() {
    this.paused = true;
    if (this.nudgeTimer) {
      clearTimeout(this.nudgeTimer);
      this.nudgeTimer = null;
    }
    if (this.abandonTimer) {
      clearTimeout(this.abandonTimer);
      this.abandonTimer = null;
    }
  }

  /**
   * Resume timers when returning to listening state and mic is unmuted
   */
  resume() {
    if (!this.active) return;
    this.paused = false;
    if (this.stage === 0) {
      this._scheduleNudge();
    } else if (this.stage === 1) {
      this._scheduleAbandon();
    }
  }

  /**
   * Stop and clear all timers
   */
  stop() {
    this.active = false;
    this.paused = false;
    this.stage = 0;
    if (this.nudgeTimer) {
      clearTimeout(this.nudgeTimer);
      this.nudgeTimer = null;
    }
    if (this.abandonTimer) {
      clearTimeout(this.abandonTimer);
      this.abandonTimer = null;
    }
  }

  isActive() {
    return this.active;
  }

  isPaused() {
    return this.paused;
  }

  getStage() {
    return this.stage;
  }
}
