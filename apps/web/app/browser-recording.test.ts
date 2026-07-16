import { describe, expect, it } from "vitest";
import { analyzeBrowserAudioQuality, preferredRecordingMimeType, recordingExtension } from "./browser-recording";

describe("browser recording policy helpers", () => {
  it("prefers mobile AAC/MP4 when WebM is unavailable", () => {
    const recorder = { isTypeSupported: (value: string) => value.startsWith("audio/mp4") } as typeof MediaRecorder;
    expect(preferredRecordingMimeType(recorder)).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(recordingExtension("audio/mp4;codecs=mp4a.40.2")).toBe("m4a");
  });

  it("creates a browser-only stable quality report", () => {
    const report = analyzeBrowserAudioQuality({
      meetingId: "meeting-1",
      recordingId: "recording-1",
      source: "BROWSER_INPUT_TEST",
      durationMs: 1_000,
      sampleRate: 48_000,
      channelCount: 1,
      frames: [
        { sequence: 0, startMs: 0, endMs: 500, rms: 0.001, peak: 0.01, zeroCrossingRate: 0.01 },
        { sequence: 1, startMs: 500, endMs: 1_000, rms: 0.1, peak: 1, zeroCrossingRate: 0.5 }
      ]
    });

    expect(report).toMatchObject({
      meetingId: "meeting-1",
      persistence: "BROWSER_ONLY",
      silenceRatio: 0.5,
      clippingRatio: 0.5,
      noiseRatio: 0.5,
      recommendPreciseAnalysis: true
    });
  });
});
