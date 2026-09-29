"use client";

/**
 * hooks/useAgent.js — Unified Voice Agent with Auto-Switching & Mode Persistence
 *
 * Wraps both useRealtimeAgent (primary Gemini Live) and useClassicAgent (fallback Groq + Web Speech).
 *
 * Requirements:
 * 1. Default mode: "realtime" (or "classic" if FORCE_CLASSIC=1 / NEXT_PUBLIC_FORCE_CLASSIC=1).
 * 2. Auto-switch to "classic" if:
 *    - Token minting fails with QUOTA_OR_UNAVAILABLE or 503/429
 *    - Connection fails or Live drops twice (reconnect fails)
 *    - Realtime Web Audio/worklet is unsupported in browser
 * 3. Shows toast notification on fallback: "Switched to backup voice mode"
 * 4. Manual mode switch available via switchMode('realtime' | 'classic')
 * 5. Persists chosen mode in sessionStorage for the duration of the browser session
 * 6. Exposes identical interface for seamless drop-in replacement
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRealtimeAgent } from "./useRealtimeAgent";
import { useClassicAgent } from "./useClassicAgent";
import { AGENT_STATES } from "@/lib/audio/realtime-state";

const STORAGE_KEY = "aria_voice_mode";
const SESSION_STORAGE_KEY = "aria_session_id";

function getOrCreateSessionId(providedId) {
  if (providedId) return providedId;
  if (typeof window === "undefined") return "session-init";
  try {
    let existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!existing) {
      existing = localStorage.getItem(SESSION_STORAGE_KEY);
    }
    if (!existing) {
      existing = "session-" + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem(SESSION_STORAGE_KEY, existing);
      localStorage.setItem(SESSION_STORAGE_KEY, existing);
    }
    return existing;
  } catch {
    return "session-" + Math.random().toString(36).slice(2, 9);
  }
}

export function useAgent(options = {}) {
  // Check forced classic flag from env
  const isForcedClassic = useMemo(() => {
    return (
      process.env.FORCE_CLASSIC === "1" ||
      process.env.NEXT_PUBLIC_FORCE_CLASSIC === "1"
    );
  }, []);

  // Persistent session ID across page refreshes and mode switches
  const [persistentSessionId, setPersistentSessionId] = useState(() => {
    return getOrCreateSessionId(options.sessionId);
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sid = getOrCreateSessionId(options.sessionId);
      setPersistentSessionId(sid);
    }
  }, [options.sessionId]);

  // Determine initial voice mode
  const [mode, setMode] = useState(() => {
    if (isForcedClassic) return "classic";
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved === "realtime" || saved === "classic") {
          return saved;
        }
      } catch {}
    }
    return "realtime";
  });

  // Toast notification state
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((message, type = "info") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const id = "toast-" + Date.now();
    setToast({ id, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 5000);
  }, []);

  const clearToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(null);
  }, []);

  const resetSession = useCallback(() => {
    const newSid = "session-" + Math.random().toString(36).slice(2, 9);
    setPersistentSessionId(newSid);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, newSid);
        localStorage.setItem(SESSION_STORAGE_KEY, newSid);
      } catch {}
    }
    return newSid;
  }, []);

  // Options augmented with unified persistent sessionId
  const agentOptions = useMemo(() => ({
    ...options,
    sessionId: persistentSessionId,
  }), [options, persistentSessionId]);

  // Instantiate both agents
  const realtime = useRealtimeAgent(agentOptions);
  const classic = useClassicAgent(agentOptions);

  // Active agent reference
  const activeAgent = mode === "classic" ? classic : realtime;

  // Track if a switch is currently in progress
  const isSwitchingRef = useRef(false);

  /**
   * Switch mode manually or programmatically
   */
  const switchMode = useCallback(
    async (newMode, reason = null) => {
      if (newMode === mode) return;

      isSwitchingRef.current = true;
      const wasActive =
        activeAgent.state !== AGENT_STATES.IDLE &&
        activeAgent.state !== AGENT_STATES.ENDED;

      // End active agent
      activeAgent.end();

      // Update state and persistence
      setMode(newMode);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(STORAGE_KEY, newMode);
        } catch {}
      }

      if (reason) {
        showToast(reason, "info");
      }

      // If previous agent was active, auto-start new agent
      if (wasActive) {
        setTimeout(() => {
          const next = newMode === "classic" ? classic : realtime;
          next.start();
          isSwitchingRef.current = false;
        }, 300);
      } else {
        isSwitchingRef.current = false;
      }
    },
    [mode, activeAgent, classic, realtime, showToast]
  );

  /**
   * Monitor Realtime Agent for fallback triggers:
   * 1. Token minting returns QUOTA_OR_UNAVAILABLE
   * 2. Reconnect fails or socket drops twice (state === ERROR)
   */
  useEffect(() => {
    if (mode !== "realtime" || isSwitchingRef.current) return;

    if (realtime.error) {
      const err = realtime.error;
      const isQuotaOrUnavailable =
        err.code === "QUOTA_OR_UNAVAILABLE" ||
        err.code === "RECONNECT_FAILED" ||
        (err.message && err.message.toLowerCase().includes("quota")) ||
        (err.message && err.message.toLowerCase().includes("unavailable")) ||
        (err.message && err.message.toLowerCase().includes("connection failed"));

      if (isQuotaOrUnavailable || realtime.state === AGENT_STATES.ERROR) {
        console.warn(
          "[useAgent] Realtime voice mode encountered failure, falling back to Classic:",
          err
        );
        switchMode("classic", "Switched to backup voice mode");
      }
    }
  }, [mode, realtime.error, realtime.state, switchMode]);

  /**
   * Unified start handler with error-catcher fallback
   */
  const start = useCallback(async () => {
    if (mode === "classic") {
      return classic.start();
    }

    try {
      await realtime.start();
    } catch (startErr) {
      console.warn("[useAgent] realtime.start() failed, switching to classic:", startErr);
      switchMode("classic", "Switched to backup voice mode");
    }
  }, [mode, realtime, classic, switchMode]);

  return {
    // Mode management
    mode,
    switchMode,
    isForcedClassic,
    toast,
    clearToast,

    state: activeAgent.state,
    transcript: activeAgent.transcript,
    toolEvents: activeAgent.toolEvents,
    detectedIntent: activeAgent.detectedIntent || { intent: "IDLE", label: "Awaiting Input", confidence: 1 },
    clearToolEvents: activeAgent.clearToolEvents || (() => {}),
    latency: activeAgent.latency,
    micAnalyser: activeAgent.micAnalyser,
    agentAnalyser: activeAgent.agentAnalyser,
    isMuted: activeAgent.isMuted,
    isUnclearAudio: activeAgent.isUnclearAudio || false,
    callResolution: activeAgent.callResolution || null,
    recording: activeAgent.recording || null,
    error: activeAgent.error,
    unsupportedReason: activeAgent.unsupportedReason || null,
    sessionId: persistentSessionId || activeAgent.sessionId,

    // Delegated actions
    start,
    end: activeAgent.end,
    mute: activeAgent.mute,
    sendUserMessage: activeAgent.sendUserMessage,
    interrupt: activeAgent.interrupt,
    resetSession,
  };
}
