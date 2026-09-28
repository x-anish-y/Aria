import { describe, it, expect, beforeEach } from "vitest";
import {
  AGENT_STATES,
  MAX_CALL_DURATION_MS,
  calculateAvg,
  calculateP50,
  deriveAgentState,
  mergeTurnFragments,
  RealtimeAgentStateMachine,
} from "@/lib/audio/realtime-state";

describe("lib/audio/realtime-state — Latency Utilities", () => {
  it("calculates avg correctly", () => {
    expect(calculateAvg([])).toBeNull();
    expect(calculateAvg(null)).toBeNull();
    expect(calculateAvg([500])).toBe(500);
    expect(calculateAvg([300, 500])).toBe(400);
    expect(calculateAvg([200, 300, 800])).toBe(433);
  });

  it("calculates median (p50) correctly", () => {
    expect(calculateP50([])).toBeNull();
    expect(calculateP50(null)).toBeNull();
    expect(calculateP50([500])).toBe(500);
    // Even length: [200, 400] -> (200 + 400) / 2 = 300
    expect(calculateP50([400, 200])).toBe(300);
    // Odd length: [100, 300, 800] -> 300
    expect(calculateP50([800, 100, 300])).toBe(300);
    // Multi-element even: [100, 200, 400, 900] -> (200 + 400) / 2 = 300
    expect(calculateP50([900, 200, 100, 400])).toBe(300);
  });
});

describe("lib/audio/realtime-state — deriveAgentState (Pure Function)", () => {
  it("derives IDLE for initial or disconnected states", () => {
    expect(deriveAgentState({})).toBe(AGENT_STATES.IDLE);
    expect(deriveAgentState({ connectionStatus: "idle" })).toBe(AGENT_STATES.IDLE);
    expect(deriveAgentState({ connectionStatus: "disconnected" })).toBe(AGENT_STATES.IDLE);
  });

  it("derives CONNECTING when connectionStatus is connecting", () => {
    expect(deriveAgentState({ connectionStatus: "connecting" })).toBe(AGENT_STATES.CONNECTING);
  });

  it("derives LISTENING when connected, mic active, not speaking or thinking", () => {
    expect(
      deriveAgentState({
        connectionStatus: "connected",
        isMicActive: true,
        isPlayingAudio: false,
        isThinking: false,
      })
    ).toBe(AGENT_STATES.LISTENING);
  });

  it("derives THINKING when waiting for agent or running tools", () => {
    expect(
      deriveAgentState({
        connectionStatus: "connected",
        isMicActive: true,
        isThinking: true,
        isPlayingAudio: false,
      })
    ).toBe(AGENT_STATES.THINKING);
  });

  it("derives SPEAKING when agent is playing audio", () => {
    expect(
      deriveAgentState({
        connectionStatus: "connected",
        isMicActive: true,
        isPlayingAudio: true,
        isThinking: false,
      })
    ).toBe(AGENT_STATES.SPEAKING);

    // Audio takes precedence over thinking
    expect(
      deriveAgentState({
        connectionStatus: "connected",
        isMicActive: true,
        isPlayingAudio: true,
        isThinking: true,
      })
    ).toBe(AGENT_STATES.SPEAKING);
  });

  it("derives ENDED when isEnded is true", () => {
    expect(deriveAgentState({ isEnded: true })).toBe(AGENT_STATES.ENDED);
    expect(
      deriveAgentState({
        connectionStatus: "connected",
        isPlayingAudio: true,
        isEnded: true,
      })
    ).toBe(AGENT_STATES.ENDED);
  });

  it("derives ERROR when error is set", () => {
    expect(deriveAgentState({ error: "Something broke" })).toBe(AGENT_STATES.ERROR);
    expect(deriveAgentState({ error: new Error("Network error") })).toBe(AGENT_STATES.ERROR);
  });
});

describe("lib/audio/realtime-state — RealtimeAgentStateMachine", () => {
  let sm;

  beforeEach(() => {
    sm = new RealtimeAgentStateMachine();
  });

  it("initializes in IDLE state with default metrics", () => {
    expect(sm.state).toBe(AGENT_STATES.IDLE);
    expect(sm.latency).toEqual({
      current: null,
      avg: null,
      p50: null,
      history: [],
    });
    expect(sm.maxCallDurationMs).toBe(MAX_CALL_DURATION_MS);
  });

  it("transitions: IDLE -> start() -> CONNECTING -> onSetupComplete() -> LISTENING", () => {
    expect(sm.start()).toBe(AGENT_STATES.CONNECTING);
    expect(sm.state).toBe(AGENT_STATES.CONNECTING);

    expect(sm.onSetupComplete()).toBe(AGENT_STATES.LISTENING);
    expect(sm.state).toBe(AGENT_STATES.LISTENING);
  });

  it("handles standard conversation turn with per-turn latency calculation", () => {
    sm.start();
    sm.onSetupComplete();

    // Turn 1: User speaks and finishes at t=1000
    sm.onUserSpeechStart();
    sm.onUserSpeechEnd(1000);
    expect(sm.state).toBe(AGENT_STATES.THINKING);

    // Agent first audio chunk arrives at t=1450 (latency = 450ms)
    sm.onAgentAudioChunk(1450);
    expect(sm.state).toBe(AGENT_STATES.SPEAKING);
    expect(sm.latency.current).toBe(450);
    expect(sm.latency.avg).toBe(450);
    expect(sm.latency.p50).toBe(450);

    // Subsequent audio chunks keep it speaking without re-measuring turn latency
    sm.onAgentAudioChunk(1500);
    expect(sm.state).toBe(AGENT_STATES.SPEAKING);
    expect(sm.latency.history).toHaveLength(1);

    // Playback finishes
    sm.onAgentAudioEnded();
    expect(sm.state).toBe(AGENT_STATES.LISTENING);

    // Turn 2: User speaks and finishes at t=5000, agent replies at t=5250 (latency = 250ms)
    sm.onUserSpeechEnd(5000);
    expect(sm.state).toBe(AGENT_STATES.THINKING);
    sm.onAgentAudioChunk(5250);
    expect(sm.state).toBe(AGENT_STATES.SPEAKING);

    expect(sm.latency.current).toBe(250);
    expect(sm.latency.history).toEqual([450, 250]);
    expect(sm.latency.avg).toBe(350); // (450 + 250) / 2
    expect(sm.latency.p50).toBe(350);

    // Turn 3: Latency = 800ms
    sm.onAgentAudioEnded();
    sm.onUserSpeechEnd(10000);
    sm.onAgentAudioChunk(10800);
    expect(sm.latency.history).toEqual([450, 250, 800]);
    expect(sm.latency.avg).toBe(500); // (450 + 250 + 800) / 3
    expect(sm.latency.p50).toBe(450); // sorted: [250, 450, 800] -> median is 450
  });

  it("handles barge-in (interrupted signal) immediately returning to LISTENING", () => {
    sm.start();
    sm.onSetupComplete();

    sm.onUserSpeechEnd(1000);
    sm.onAgentAudioChunk(1300);
    expect(sm.state).toBe(AGENT_STATES.SPEAKING);

    // Barge-in: user talks over Aria
    sm.onInterrupted();
    expect(sm.state).toBe(AGENT_STATES.LISTENING);
    expect(sm.isPlayingAudio).toBe(false);
  });

  it("handles tool calling cycle: LISTENING -> THINKING -> SPEAKING", () => {
    sm.start();
    sm.onSetupComplete();

    // User asks question
    sm.onUserSpeechEnd(2000);
    expect(sm.state).toBe(AGENT_STATES.THINKING);

    // Model triggers tool
    sm.onToolCallStart();
    expect(sm.state).toBe(AGENT_STATES.THINKING);

    // Tool executes and client sends response
    sm.onToolCallEnd();
    expect(sm.state).toBe(AGENT_STATES.THINKING);

    // Model begins replying with audio
    sm.onAgentAudioChunk(3200);
    expect(sm.state).toBe(AGENT_STATES.SPEAKING);
    expect(sm.latency.current).toBe(1200);
  });

  it("handles single automatic reconnect on unexpected socket drop", () => {
    sm.start();
    sm.onSetupComplete();
    expect(sm.state).toBe(AGENT_STATES.LISTENING);

    // First unexpected drop (e.g. 1006 abnormal closure)
    const firstDrop = sm.onSocketDropped(1006, "Abnormal closure");
    expect(firstDrop.shouldReconnect).toBe(true);
    expect(sm.state).toBe(AGENT_STATES.CONNECTING);
    expect(sm.reconnectAttempts).toBe(1);

    // Second unexpected drop (reconnect exhausted)
    const secondDrop = sm.onSocketDropped(1006, "Abnormal closure again");
    expect(secondDrop.shouldReconnect).toBe(false);
    expect(sm.state).toBe(AGENT_STATES.ERROR);
    expect(sm.error?.code).toBe("SOCKET_DROP");
  });

  it("does not attempt reconnect on normal clean socket close (1000)", () => {
    sm.start();
    sm.onSetupComplete();

    const drop = sm.onSocketDropped(1000, "Normal closure");
    expect(drop.shouldReconnect).toBe(false);
    expect(sm.state).toBe(AGENT_STATES.ENDED);
  });

  it("handles 10-minute call timeout", () => {
    sm.start();
    sm.onSetupComplete();

    sm.onCallTimeout();
    expect(sm.state).toBe(AGENT_STATES.ENDED);
  });

  it("supports robust teardown anytime from any state", () => {
    // 1. From CONNECTING
    sm.start();
    expect(sm.state).toBe(AGENT_STATES.CONNECTING);
    sm.end();
    expect(sm.state).toBe(AGENT_STATES.ENDED);

    // 2. From SPEAKING
    sm.reset();
    sm.start();
    sm.onSetupComplete();
    sm.onAgentAudioChunk(1000);
    expect(sm.state).toBe(AGENT_STATES.SPEAKING);
    sm.end();
    expect(sm.state).toBe(AGENT_STATES.ENDED);

    // 3. Repeated end() calls do not fail
    expect(() => {
      sm.end();
      sm.end();
    }).not.toThrow();
    expect(sm.state).toBe(AGENT_STATES.ENDED);
  });
});
