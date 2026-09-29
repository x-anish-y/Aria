import { describe, it, expect, beforeEach } from "vitest";
import { getCallRecordById, saveCallRecord, clearInMemoryCalls } from "@/lib/db";
import { mergeTurnFragments } from "@/lib/audio/realtime-state";
import { getSupportedMimeType } from "@/lib/audio/call-recorder";
import {
  saveSessionRecording,
  getSessionRecording,
  clearSessionRecordings,
} from "@/lib/audio/indexeddb-audio";

describe("Task 16: Call Replay and Shareable Report", () => {
  beforeEach(() => {
    clearInMemoryCalls();
  });

  describe("getCallRecordById (Data & Privacy)", () => {
    it("strips session_id from public report responses", async () => {
      // Create a test call record with private session_id
      const saveRes = await saveCallRecord({
        sessionId: "secret-customer-session-98765",
        mode: "realtime",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: 45,
        transcript: [{ speaker: "user", text: "Hello", offsetMs: 1200 }],
        toolEvents: [],
        summary: {
          customer_intent: "ORDER_TRACKING",
          resolution_status: "RESOLVED",
          call_summary: "Customer said hello.",
        },
        metrics: { turns: 1 },
      });

      expect(saveRes.ok).toBe(true);
      const callId = saveRes.id;

      // Retrieve via public getter
      const publicRecord = await getCallRecordById(callId);
      expect(publicRecord).not.toBeNull();
      expect(publicRecord.id).toBe(callId);
      expect(publicRecord.session_id).toBeUndefined(); // MUST be stripped
      expect(publicRecord.summary.customer_intent).toBe("ORDER_TRACKING");
    });

    it("returns seed demo call records when call is in seedCallHistory and strips session_id", async () => {
      const demoCall = await getCallRecordById("demo-call-1");
      expect(demoCall).not.toBeNull();
      expect(demoCall.id).toBe("demo-call-1");
      expect(demoCall.session_id).toBeUndefined(); // MUST be stripped
      expect(demoCall.summary.order_id).toBe("ORD-101");
      expect(demoCall.transcript.length).toBeGreaterThan(0);
    });

    it("returns null for non-existent or expired call IDs (graceful 404)", async () => {
      const nonExistent = await getCallRecordById("unknown-call-99999");
      expect(nonExistent).toBeNull();
    });

    it("returns null for invalid or null arguments", async () => {
      expect(await getCallRecordById(null)).toBeNull();
      expect(await getCallRecordById("")).toBeNull();
      expect(await getCallRecordById(undefined)).toBeNull();
    });
  });

  describe("mergeTurnFragments (Transcript Offset Tracking)", () => {
    it("records and maintains offsetMs from call start for replay player sync", () => {
      let turns = [];

      // Initial user turn with offset
      turns = mergeTurnFragments(turns, "user", "Track my order", {
        offsetMs: 1500,
        complete: true,
      });

      expect(turns).toHaveLength(1);
      expect(turns[0].speaker).toBe("user");
      expect(turns[0].text).toBe("Track my order");
      expect(turns[0].offsetMs).toBe(1500);

      // Subsequent agent streaming turn
      turns = mergeTurnFragments(turns, "agent", "Sure, ", {
        offsetMs: 3200,
      });

      expect(turns).toHaveLength(2);
      expect(turns[1].speaker).toBe("agent");
      expect(turns[1].offsetMs).toBe(3200);

      // Append token to current agent turn: offsetMs should be preserved
      turns = mergeTurnFragments(turns, "agent", "what is your order number?");

      expect(turns).toHaveLength(2);
      expect(turns[1].text).toBe("Sure, what is your order number?");
      expect(turns[1].offsetMs).toBe(3200); // Preserved
    });
  });

  describe("CallRecorder & Codec Negotiation", () => {
    it("returns empty string or detected string without error when MediaRecorder is unavailable", () => {
      const mime = getSupportedMimeType();
      expect(typeof mime).toBe("string");
    });

    it("prioritizes audio/webm codecs on Chrome/Firefox and mp4 on Safari", () => {
      const originalMediaRecorder = global.MediaRecorder;
      try {
        // Chrome mock: supports webm
        global.MediaRecorder = {
          isTypeSupported: (type) => type.includes("webm"),
        };
        expect(getSupportedMimeType()).toBe("audio/webm;codecs=opus");

        // Safari mock: only supports mp4 / aac
        global.MediaRecorder = {
          isTypeSupported: (type) => type.includes("mp4") || type.includes("aac"),
        };
        expect(getSupportedMimeType()).toBe("audio/mp4");
      } finally {
        if (originalMediaRecorder) {
          global.MediaRecorder = originalMediaRecorder;
        } else {
          delete global.MediaRecorder;
        }
      }
    });
  });

  describe("IndexedDB Audio Storage (Zero Server Upload Privacy)", () => {
    it("handles absence of indexedDB in Node environment without crashing", async () => {
      const dummyBlob = new Blob(["dummy audio bytes"], { type: "audio/webm" });
      const saveRes = await saveSessionRecording("test-call-1", dummyBlob, false);
      expect(saveRes).toBeNull();

      const cached = await getSessionRecording("test-call-1");
      expect(cached).toBeNull();

      await expect(clearSessionRecordings()).resolves.toBeUndefined();
    });
  });
});
