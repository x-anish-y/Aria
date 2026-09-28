/**
 * public/worklets/mic-processor.js
 *
 * AudioWorkletProcessor that downsamples microphone input audio to 16 kHz mono PCM16
 * in ~20-40 ms chunks (512 samples @ 16 kHz = 32 ms).
 *
 * Runs in AudioWorkletGlobalScope.
 */

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.chunkSize = 512; // 512 samples @ 16 kHz = 32 ms (~20-40 ms)
    this.buffer = new Int16Array(this.chunkSize);
    this.bufferIndex = 0;

    // Resampling phase accumulator
    this.resampleRatio = sampleRate / this.targetSampleRate;
    this.resamplePhase = 0;
    this.lastInputSample = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true; // Keep processor alive
    }

    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    const inputLength = channelData.length;

    // If source is already 16 kHz, copy directly
    if (sampleRate === this.targetSampleRate) {
      for (let i = 0; i < inputLength; i++) {
        const floatSample = channelData[i];
        // Clamp and convert to signed 16-bit integer
        const clamped = Math.max(-1, Math.min(1, floatSample));
        this.buffer[this.bufferIndex++] = clamped < 0 ? clamped * 32768 : clamped * 32767;

        if (this.bufferIndex >= this.chunkSize) {
          this.flush();
        }
      }
      return true;
    }

    // Resample from AudioContext sampleRate down to 16000 Hz using linear interpolation
    let inputIdx = this.resamplePhase;

    while (inputIdx < inputLength) {
      const idxFloor = Math.floor(inputIdx);
      const frac = inputIdx - idxFloor;

      const sample0 = idxFloor >= 0 ? channelData[idxFloor] : this.lastInputSample;
      const sample1 = idxFloor + 1 < inputLength ? channelData[idxFloor + 1] : sample0;

      // Linear interpolation
      const interpolated = sample0 + frac * (sample1 - sample0);
      const clamped = Math.max(-1, Math.min(1, interpolated));

      this.buffer[this.bufferIndex++] = clamped < 0 ? clamped * 32768 : clamped * 32767;

      if (this.bufferIndex >= this.chunkSize) {
        this.flush();
      }

      inputIdx += this.resampleRatio;
    }

    // Save carryover phase and last sample for boundary interpolation
    this.resamplePhase = inputIdx - inputLength;
    this.lastInputSample = channelData[inputLength - 1] || 0;

    return true; // Keep alive
  }

  flush() {
    // Post buffer to main thread as transferable ArrayBuffer
    this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
    this.buffer = new Int16Array(this.chunkSize);
    this.bufferIndex = 0;
  }
}

registerProcessor("mic-processor", MicProcessor);
