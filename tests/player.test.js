import { describe, it, expect, vi, beforeEach } from "vitest";
import { Pcm16Player } from "@/lib/audio/player";

describe("lib/audio/player.js — Pcm16Player", () => {
  let mockContext;
  let mockAnalyser;
  let createdSources;

  beforeEach(() => {
    createdSources = [];
    mockAnalyser = {
      fftSize: 256,
      smoothingTimeConstant: 0.8,
      frequencyBinCount: 128,
      connect: vi.fn(),
      getByteFrequencyData: vi.fn((arr) => arr.fill(128)),
      getByteTimeDomainData: vi.fn((arr) => arr.fill(128)),
    };

    mockContext = {
      state: "suspended",
      currentTime: 1.0,
      destination: {},
      resume: vi.fn().mockImplementation(async () => {
        mockContext.state = "running";
      }),
      createAnalyser: vi.fn(() => mockAnalyser),
      createBuffer: vi.fn((channels, length, sampleRate) => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length)),
      })),
      createBufferSource: vi.fn(() => {
        const src = {
          buffer: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        createdSources.push(src);
        return src;
      }),
      close: vi.fn(),
    };
  });

  it("initializes safely with target sample rate of 24000", () => {
    const player = new Pcm16Player({ audioContext: mockContext });
    expect(player.targetSampleRate).toBe(24000);
    expect(player.audioContext).toBe(mockContext);
  });

  it("resumes suspended audioContext on resume() call", async () => {
    const player = new Pcm16Player({ audioContext: mockContext });
    expect(mockContext.state).toBe("suspended");

    await player.resume();
    expect(mockContext.resume).toHaveBeenCalled();
    expect(mockContext.state).toBe("running");
  });

  it("queues and schedules audio buffer sources gaplessly", () => {
    const player = new Pcm16Player({ audioContext: mockContext });

    // Mock 480 samples of 16-bit PCM (960 bytes)
    const int16 = new Int16Array(480);
    int16.fill(16000);

    player.queueChunk(int16);

    expect(createdSources.length).toBe(1);
    const source1 = createdSources[0];
    expect(source1.connect).toHaveBeenCalled();
    expect(source1.start).toHaveBeenCalledWith(1.025); // 1.0 + 0.025 lead time

    // Duration of 480 samples @ 24000 Hz = 0.02s
    expect(player.nextStartTime).toBeCloseTo(1.045);

    // Queue second chunk immediately
    player.queueChunk(int16);
    expect(createdSources.length).toBe(2);
    const source2 = createdSources[1];
    expect(source2.start).toHaveBeenCalledWith(1.045); // Scheduled right after source 1
    expect(player.nextStartTime).toBeCloseTo(1.065);
  });

  it("decodes Base64 PCM16 strings", () => {
    const player = new Pcm16Player({ audioContext: mockContext });

    // 2 samples: [0, 16384] -> 4 bytes
    const int16 = new Int16Array([0, 16384]);
    const uint8 = new Uint8Array(int16.buffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const b64 = Buffer.from(binary, "binary").toString("base64");

    player.queueChunk(b64);
    expect(createdSources.length).toBe(1);
  });

  it("stops all active sources immediately on stop()", () => {
    const player = new Pcm16Player({ audioContext: mockContext });
    const int16 = new Int16Array(240);

    player.queueChunk(int16);
    player.queueChunk(int16);

    expect(createdSources.length).toBe(2);
    expect(player.activeSources.size).toBe(2);

    player.stop();

    for (const src of createdSources) {
      expect(src.stop).toHaveBeenCalled();
      expect(src.disconnect).toHaveBeenCalled();
    }
    expect(player.activeSources.size).toBe(0);
    expect(player.nextStartTime).toBe(0);
  });

  it("exposes AnalyserNode frequency and waveform data", () => {
    const player = new Pcm16Player({ audioContext: mockContext });
    player.analyser = mockAnalyser;

    const freq = player.getFrequencyData();
    expect(freq).toBeInstanceOf(Uint8Array);
    expect(mockAnalyser.getByteFrequencyData).toHaveBeenCalled();

    const wave = player.getWaveformData();
    expect(wave).toBeInstanceOf(Uint8Array);
    expect(mockAnalyser.getByteTimeDomainData).toHaveBeenCalled();
  });
});
