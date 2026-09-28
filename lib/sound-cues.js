/**
 * lib/sound-cues.js — Web Audio Synthesized Sound Cues
 *
 * Subtle, luxury audio cues on call start and call end for Aura Skincare.
 * - Muted by default (opt-in toggle for zero unwanted audio)
 * - Persisted in localStorage ('aura_sound_cues')
 * - Synthesized via Web Audio API oscillators (0 external audio assets, 0 network lag, 0 bundle size)
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSoundCuesEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("aura_sound_cues") === "enabled";
  } catch {
    return false;
  }
}

export function setSoundCuesEnabled(enabled) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("aura_sound_cues", enabled ? "enabled" : "disabled");
  } catch {}
}

/**
 * Play a gentle, bioluminescent rising chord (C5 -> E5) on call start.
 * Soft sine wave with exponential decay, maximum peak gain 0.05.
 */
export function playCallStartCue() {
  if (!isSoundCuesEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Gentle rising interval: C5 (523.25 Hz) to E5 (659.25 Hz)
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.16);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch {}
}

/**
 * Play a gentle descending resolution chime (D5 -> A4) on call end.
 * Soft sine wave with exponential decay, maximum peak gain 0.035.
 */
export function playCallEndCue() {
  if (!isSoundCuesEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Gentle descending interval: D5 (587.33 Hz) to A4 (440.0 Hz)
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(440.0, now + 0.18);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.39);
  } catch {}
}
