/**
 * lib/audio/realtime-state.js
 *
 * State derivation and state machine logic for Gemini Live realtime agent.
 *
 * States:
 * - 'idle': Initial state before start() or after full reset.
 * - 'connecting': Fetching token, establishing WebSocket, initializing audio worklet.
 * - 'listening': Connected, microphone active, listening to user speech.
 * - 'thinking': User turn finished or tools executing, awaiting model response.
 * - 'speaking': Model audio chunks actively playing in Pcm16Player.
 * - 'ended': Call terminated intentionally (user end() or 10-minute timeout).
 * - 'error': Unrecoverable error or unexpected drop where reconnect failed.
 */

export const AGENT_STATES = Object.freeze({
  IDLE: "idle",
  CONNECTING: "connecting",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "speaking",
  ENDED: "ended",
  ERROR: "error",
});

export const MAX_CALL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Calculate numerical average (mean) of an array of numbers.
 * @param {number[]} values
 * @returns {number|null}
 */
export function calculateAvg(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / values.length);
}

/**
 * Calculate median (p50) of an array of numbers.
 * @param {number[]} values
 * @returns {number|null}
 */
export function calculateP50(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

/**
 * Pure state derivation from real active signals.
 *
 * @param {object} signals
 * @param {string} [signals.connectionStatus='idle'] - 'idle' | 'connecting' | 'connected' | 'disconnected'
 * @param {boolean} [signals.isMicActive=false]
 * @param {boolean} [signals.isPlayingAudio=false]
 * @param {boolean} [signals.isThinking=false]
 * @param {boolean} [signals.isEnded=false]
 * @param {any} [signals.error=null]
 * @returns {string} One of AGENT_STATES
 */
export function deriveAgentState(signals = {}) {
  const {
    connectionStatus = "idle",
    isMicActive = false,
    isPlayingAudio = false,
    isThinking = false,
    isEnded = false,
    error = null,
  } = signals;

  if (error) return AGENT_STATES.ERROR;
  if (isEnded) return AGENT_STATES.ENDED;
  if (connectionStatus === "connecting") return AGENT_STATES.CONNECTING;
  if (connectionStatus === "idle" || connectionStatus === "disconnected") return AGENT_STATES.IDLE;

  if (connectionStatus === "connected") {
    if (isPlayingAudio) return AGENT_STATES.SPEAKING;
    if (isThinking) return AGENT_STATES.THINKING;
    if (isMicActive) return AGENT_STATES.LISTENING;
    return AGENT_STATES.LISTENING;
  }

  return AGENT_STATES.IDLE;
}

/**
 * Turn fragment merging utility for streaming live transcripts
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
      timestamp: options.timestamp || new Date().toLocaleTimeString(),
      isComplete: Boolean(options.complete),
      isInterrupted: Boolean(options.interrupted),
    },
  ];
}

/**
 * State machine managing agent transitions, auto-reconnect, and per-turn latency.
 */
export class RealtimeAgentStateMachine {
  /**
   * @param {object} [options]
   * @param {number} [options.maxCallDurationMs=MAX_CALL_DURATION_MS]
   * @param {number} [options.maxReconnectAttempts=1]
   */
  constructor(options = {}) {
    this.maxCallDurationMs = options.maxCallDurationMs || MAX_CALL_DURATION_MS;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 1;

    this.state = AGENT_STATES.IDLE;
    this.error = null;
    this.reconnectAttempts = 0;

    // Real signals
    this.connectionStatus = "idle"; // idle | connecting | connected | disconnected
    this.isMicActive = false;
    this.isPlayingAudio = false;
    this.isThinking = false;
    this.isEnded = false;

    // Latency metrics (end of user speech -> first agent audio chunk)
    this.userSpeechEndTime = null;
    this.isAwaitingAgentAudio = false;
    this.latencyHistory = [];
    this.currentLatency = null;
  }

  /**
   * Get current latency metrics
   */
  get latency() {
    return {
      current: this.currentLatency,
      avg: calculateAvg(this.latencyHistory),
      p50: calculateP50(this.latencyHistory),
      history: [...this.latencyHistory],
    };
  }

  /**
   * Internal helper: re-derives state from active signals
   * @private
   */
  _updateState() {
    this.state = deriveAgentState({
      connectionStatus: this.connectionStatus,
      isMicActive: this.isMicActive,
      isPlayingAudio: this.isPlayingAudio,
      isThinking: this.isThinking,
      isEnded: this.isEnded,
      error: this.error,
    });
    return this.state;
  }

  /**
   * User calls start()
   */
  start() {
    if (this.state === AGENT_STATES.CONNECTING || this.state === AGENT_STATES.LISTENING) {
      return this.state;
    }
    this.isEnded = false;
    this.error = null;
    this.connectionStatus = "connecting";
    this.isMicActive = false;
    this.isPlayingAudio = false;
    this.isThinking = false;
    return this._updateState();
  }

  /**
   * Server sends setupComplete and mic is active
   */
  onSetupComplete() {
    this.connectionStatus = "connected";
    this.isMicActive = true;
    this.isThinking = false;
    this.isPlayingAudio = false;
    this.reconnectAttempts = 0; // Reset reconnect counter on successful setup
    return this._updateState();
  }

  /**
   * User begins speaking
   */
  onUserSpeechStart() {
    this.isThinking = false;
    return this._updateState();
  }

  /**
   * End of user speech detected (turnComplete or VAD boundary)
   * @param {number} [timestamp=Date.now()]
   */
  onUserSpeechEnd(timestamp = Date.now()) {
    this.userSpeechEndTime = timestamp;
    this.isAwaitingAgentAudio = true;
    this.isThinking = true;
    return this._updateState();
  }

  /**
   * Model requests function call execution
   */
  onToolCallStart() {
    this.isThinking = true;
    return this._updateState();
  }

  /**
   * Function response returned to model
   */
  onToolCallEnd() {
    this.isThinking = true;
    return this._updateState();
  }

  /**
   * First agent audio chunk arrives
   * @param {number} [timestamp=Date.now()]
   */
  onAgentAudioChunk(timestamp = Date.now()) {
    if (this.isAwaitingAgentAudio && this.userSpeechEndTime !== null) {
      const delta = Math.max(0, timestamp - this.userSpeechEndTime);
      this.currentLatency = Math.round(delta);
      this.latencyHistory.push(this.currentLatency);
      this.userSpeechEndTime = null;
      this.isAwaitingAgentAudio = false;
    }
    this.isThinking = false;
    this.isPlayingAudio = true;
    return this._updateState();
  }

  /**
   * Agent playback queue finished playing
   */
  onAgentAudioEnded() {
    this.isPlayingAudio = false;
    return this._updateState();
  }

  /**
   * Barge-in interrupted signal received
   */
  onInterrupted() {
    this.isPlayingAudio = false;
    this.isThinking = false;
    this.userSpeechEndTime = null;
    this.isAwaitingAgentAudio = false;
    return this._updateState();
  }

  /**
   * Socket drop handler with single auto-reconnect
   * @param {number} code
   * @param {string} [reason]
   * @returns {{ shouldReconnect: boolean }}
   */
  onSocketDropped(code, reason) {
    if (this.isEnded) {
      return { shouldReconnect: false };
    }

    // Clean normal closure (1000)
    if (code === 1000) {
      this.connectionStatus = "disconnected";
      this.isEnded = true;
      this._updateState();
      return { shouldReconnect: false };
    }

    // Unexpected socket drop: attempt exactly one reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.connectionStatus = "connecting";
      this.isPlayingAudio = false;
      this.isThinking = false;
      this._updateState();
      return { shouldReconnect: true };
    }

    // Reconnect exhausted -> error
    this.connectionStatus = "disconnected";
    this.error = {
      code: "SOCKET_DROP",
      message: `WebSocket dropped unexpectedly (code ${code}): ${reason || "Connection lost"}`,
    };
    this._updateState();
    return { shouldReconnect: false };
  }

  /**
   * Error reported
   * @param {any} err
   */
  onError(err) {
    this.error = typeof err === "string" ? { message: err } : err;
    return this._updateState();
  }

  /**
   * 10-minute call timeout reached
   */
  onCallTimeout() {
    this.isEnded = true;
    this.connectionStatus = "disconnected";
    this.isPlayingAudio = false;
    this.isThinking = false;
    return this._updateState();
  }

  /**
   * Explicit call termination
   */
  end() {
    this.isEnded = true;
    this.connectionStatus = "disconnected";
    this.isPlayingAudio = false;
    this.isThinking = false;
    return this._updateState();
  }

  /**
   * Reset back to initial idle state
   */
  reset() {
    this.state = AGENT_STATES.IDLE;
    this.error = null;
    this.reconnectAttempts = 0;
    this.connectionStatus = "idle";
    this.isMicActive = false;
    this.isPlayingAudio = false;
    this.isThinking = false;
    this.isEnded = false;
    this.userSpeechEndTime = null;
    this.isAwaitingAgentAudio = false;
    this.latencyHistory = [];
    this.currentLatency = null;
    return this.state;
  }
}
