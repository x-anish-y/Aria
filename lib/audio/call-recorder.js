/**
 * lib/audio/call-recorder.js — Client-side Audio Mixer & MediaRecorder Engine
 *
 * Requirements (Task 16):
 * 1. During call, mix the mic stream and agent output into a single MediaRecorder stream
 *    via a MediaStreamAudioDestinationNode (both modes; in Classic mode record mic only and note it).
 * 2. Keep the blob in memory / IndexedDB for this session only. Do NOT upload audio anywhere.
 * 3. Browser codec support for Safari (audio/mp4, audio/aac) vs Chrome (audio/webm;codecs=opus).
 */

/**
 * Detect the best supported MediaRecorder MIME type for the user's browser.
 * Safari does not support audio/webm; it requires audio/mp4 or audio/aac.
 * Chrome, Firefox, and Edge prefer audio/webm;codecs=opus.
 *
 * @returns {string} Supported MIME type or empty string for browser default
 */
export function getSupportedMimeType() {
  const MR =
    (typeof window !== "undefined" && window.MediaRecorder) ||
    (typeof MediaRecorder !== "undefined" ? MediaRecorder : null);

  if (!MR || typeof MR.isTypeSupported !== "function") return "";

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];

  for (const type of candidates) {
    try {
      if (MR.isTypeSupported(type)) {
        return type;
      }
    } catch {
      // Ignore detection errors in older engines
    }
  }

  return "";
}

export class CallRecorder {
  /**
   * @param {object} options
   * @param {AudioContext} options.audioContext - Web Audio Context
   * @param {MediaStream} options.micStream - Microphone MediaStream
   * @param {any} [options.player] - Pcm16Player instance (Live mode)
   * @param {string} [options.mode="realtime"] - "realtime" | "classic"
   */
  constructor({ audioContext, micStream, player = null, mode = "realtime" } = {}) {
    this.audioContext = audioContext || null;
    this.micStream = micStream || null;
    this.player = player || null;
    this.mode = mode;

    this.mediaRecorder = null;
    this.destNode = null;
    this.micSourceNode = null;
    this.chunks = [];
    this.isRecording = false;
    this.startTime = 0;
    this.mimeType = "";
    this.isClassicOnly = mode === "classic";
  }

  /**
   * Start recording and mixing audio
   */
  start() {
    if (typeof window === "undefined" || !window.MediaRecorder) {
      console.warn("[CallRecorder] MediaRecorder is not supported in this environment.");
      return false;
    }
    if (!this.audioContext || this.audioContext.state === "closed") {
      console.warn("[CallRecorder] Invalid or closed AudioContext.");
      return false;
    }

    try {
      this.chunks = [];
      this.startTime = Date.now();

      // 1. Create MediaStreamAudioDestinationNode for mixing
      this.destNode = this.audioContext.createMediaStreamDestination();

      // 2. Mix microphone audio if stream is active
      if (this.micStream && this.micStream.active) {
        try {
          this.micSourceNode = this.audioContext.createMediaStreamSource(this.micStream);
          this.micSourceNode.connect(this.destNode);
        } catch (micErr) {
          console.warn("[CallRecorder] Failed to connect mic stream to mixer:", micErr);
        }
      }

      // 3. In Live mode, mix agent playback output from Pcm16Player analyser
      if (this.mode === "realtime" && this.player?.analyser) {
        try {
          this.player.analyser.connect(this.destNode);
        } catch (agentErr) {
          console.warn("[CallRecorder] Failed to connect agent output to mixer:", agentErr);
        }
      }

      // 4. Initialize MediaRecorder with cross-browser codec detection
      this.mimeType = getSupportedMimeType();
      const recorderOptions = this.mimeType ? { mimeType: this.mimeType } : undefined;

      this.mediaRecorder = new MediaRecorder(this.destNode.stream, recorderOptions);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      // Slice recording into 250ms chunks to avoid data loss
      this.mediaRecorder.start(250);
      this.isRecording = true;
      return true;
    } catch (err) {
      console.warn("[CallRecorder] Failed to start MediaRecorder:", err);
      this.isRecording = false;
      return false;
    }
  }

  /**
   * Stop recording and package into a Blob and Object URL
   *
   * @returns {Promise<{ blob: Blob, url: string, durationMs: number, mimeType: string, isClassicOnly: boolean } | null>}
   */
  stop() {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      this._teardownNodes();
      return Promise.resolve(null);
    }

    const durationMs = Math.max(0, Date.now() - this.startTime);

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        try {
          const effectiveMime = this.mimeType || this.mediaRecorder.mimeType || "audio/webm";
          const blob = new Blob(this.chunks, { type: effectiveMime });
          const url = URL.createObjectURL(blob);

          this._teardownNodes();
          this.isRecording = false;

          resolve({
            blob,
            url,
            durationMs,
            mimeType: effectiveMime,
            isClassicOnly: this.isClassicOnly,
          });
        } catch (err) {
          console.warn("[CallRecorder] Error finalizing recording blob:", err);
          this._teardownNodes();
          this.isRecording = false;
          resolve(null);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch (stopErr) {
        console.warn("[CallRecorder] Exception calling mediaRecorder.stop():", stopErr);
        this._teardownNodes();
        this.isRecording = false;
        resolve(null);
      }
    });
  }

  _teardownNodes() {
    if (this.micSourceNode && this.destNode) {
      try {
        this.micSourceNode.disconnect(this.destNode);
      } catch {}
      this.micSourceNode = null;
    }

    if (this.player?.analyser && this.destNode) {
      try {
        this.player.analyser.disconnect(this.destNode);
      } catch {}
    }

    this.destNode = null;
  }
}
