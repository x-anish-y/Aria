/**
 * lib/audio/player.js — Gapless PCM16 24 kHz audio playback queue
 *
 * Requirements:
 * 1. Gapless PCM16 24 kHz playback queue with scheduled AudioBufferSourceNodes
 * 2. Immediate stop() for interruption handling
 * 3. AnalyserNode for audio visualization / voice orb activity
 * 4. SSR safe (safe to import on server)
 */

export class Pcm16Player {
  /**
   * @param {object} [options]
   * @param {number} [options.sampleRate=24000] - Output PCM sample rate (Gemini Live outputs 24kHz)
   * @param {AudioContext} [options.audioContext] - Existing AudioContext, if any
   */
  constructor(options = {}) {
    this.targetSampleRate = options.sampleRate || 24000;
    this.audioContext = options.audioContext || null;
    this.analyser = null;
    this.nextStartTime = 0;
    this.activeSources = new Set();
    this.leadTime = 0.025; // 25ms lead-in buffer to prevent crackle/underrun
    this.onPlaybackEnded = null;

    if (typeof window !== "undefined") {
      this.initContext();
    }
  }

  /**
   * Initialize AudioContext and AnalyserNode
   */
  initContext() {
    if (this.audioContext) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn("[Pcm16Player] Web Audio API is not supported in this browser.");
      return;
    }

    this.audioContext = new AudioCtx();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.connect(this.audioContext.destination);
  }

  /**
   * Ensure AudioContext is running (required on user gesture for Safari / Chrome)
   */
  async resume() {
    this.initContext();
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Enqueue a PCM16 24 kHz chunk for scheduled gapless playback.
   *
   * @param {string | ArrayBuffer | Uint8Array | Int16Array} chunk - Base64 string or raw byte buffer
   */
  queueChunk(chunk) {
    if (!chunk) return;
    this.initContext();
    if (!this.audioContext) return;

    let int16Data;

    if (typeof chunk === "string") {
      // Decode Base64 string
      const binaryString = atob(chunk);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      int16Data = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    } else if (chunk instanceof Int16Array) {
      int16Data = chunk;
    } else if (chunk instanceof Uint8Array) {
      int16Data = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
    } else if (chunk instanceof ArrayBuffer) {
      int16Data = new Int16Array(chunk);
    } else {
      console.warn("[Pcm16Player] Unsupported chunk type:", typeof chunk);
      return;
    }

    const numSamples = int16Data.length;
    if (numSamples === 0) return;

    // Create 24 kHz AudioBuffer (Web Audio API resamples to hardware output rate automatically)
    const audioBuffer = this.audioContext.createBuffer(1, numSamples, this.targetSampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      channelData[i] = int16Data[i] / 32768.0;
    }

    // Schedule node in the gapless queue
    const currentTime = this.audioContext.currentTime;

    // If the playback queue ran dry or this is the first chunk, schedule slightly in the future
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + this.leadTime;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;

    if (this.analyser) {
      source.connect(this.analyser);
    } else {
      source.connect(this.audioContext.destination);
    }

    const scheduledTime = this.nextStartTime;
    source.start(scheduledTime);
    this.nextStartTime += audioBuffer.duration;

    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      // Don't fire onPlaybackEnded during a forced stop() — the caller handles state
      if (this._stopping) return;
      if (this.activeSources.size === 0 && typeof this.onPlaybackEnded === "function") {
        this.onPlaybackEnded();
      }
    };
  }

  /**
   * Immediate stop for interruption handling: stops all queued sources immediately.
   * Sets a _stopping flag to prevent the source.onended callbacks from firing
   * onPlaybackEnded, since the caller handles the state transition.
   */
  stop() {
    this._stopping = true;
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    this._stopping = false;
  }

  /**
   * Get frequency data for visualizer (0-255 per bin)
   * @returns {Uint8Array}
   */
  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * Get waveform time-domain data for visualizer (0-255, centered at 128)
   * @returns {Uint8Array}
   */
  getWaveformData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  /**
   * Teardown player and release AudioContext
   */
  async close() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch {}
      this.audioContext = null;
      this.analyser = null;
    }
  }
}
