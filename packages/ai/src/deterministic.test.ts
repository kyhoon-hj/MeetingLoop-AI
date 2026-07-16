import { describe, expect, it } from "vitest";
import {
  DeterministicAudioNormalizationProvider,
  DeterministicAudioQualityProvider,
  DeterministicMeetingReviewProvider,
  DeterministicOverlapProvider
} from "./deterministic";

const createdAt = "2026-07-15T00:00:00.000Z";

describe("browser-only deterministic providers", () => {
  it("analyzes frame metadata without requiring an audio upload", async () => {
    const provider = new DeterministicAudioQualityProvider();
    const report = await provider.analyze({
      organizationId: "org-1", meetingId: "meeting-1", recordingId: "recording-1",
      source: "BROWSER_INPUT_TEST", durationMs: 1000, sampleRate: 48000, channelCount: 1,
      preview: false,
      frames: [{ sequence: 0, startMs: 0, endMs: 1000, rms: 0.08, peak: 0.4, zeroCrossingRate: 0.1 }]
    });
    expect(report.persistence).toBe("BROWSER_ONLY");
    expect(provider.capability).toMatchObject({ mode: "demo", requiresAudioUpload: false, supportsServerPersistence: false });
  });

  it("keeps normalized artifacts as browser references", async () => {
    const result = await new DeterministicAudioNormalizationProvider().normalize({
      organizationId: "org-1", meetingId: "meeting-1", recordingId: "recording-1",
      sourceBrowserKey: "indexeddb://recording/source.wav", originalMimeType: "audio/wav",
      durationMs: 1000, sampleRate: 48000, channelCount: 1,
      targetSampleRate: 16000, enableNoiseReduction: true, enableDereverberation: false,
      inputMetrics: { integratedLufs: -24, truePeakDb: -4, noiseFloorDb: -48 }
    });
    expect(result.analysisArtifact.browserKey).toContain("indexeddb://");
    expect(result).not.toHaveProperty("storageKey");
  });

  it("marks HIGH overlap and unconfirmed review evidence for human review", async () => {
    const overlap = await new DeterministicOverlapProvider().detect({
      organizationId: "org-1", meetingId: "meeting-1", recordingId: "recording-1", durationMs: 1000,
      preview: false,
      frames: [{ sequence: 0, startMs: 0, endMs: 1000, rms: 0.1, peak: 0.4, zeroCrossingRate: 0.1, overlapProbability: 0.92 }]
    });
    expect(overlap.regions[0]).toMatchObject({ severity: "HIGH", decisionEvidenceAllowed: false });

    const review = await new DeterministicMeetingReviewProvider().analyze({
      organizationId: "org-1", meetingId: "meeting-1", meetingStartedAt: createdAt, timezone: "Asia/Seoul",
      participants: [], segments: [{ id: "segment-1", organizationId: "org-1", meetingId: "meeting-1",
        sequence: 0, speakerLabel: "Unknown", startMs: 0, endMs: 1000,
        rawText: "배포 확정", normalizedText: "배포 확정", editedText: "금요일 배포로 결정했습니다.",
        source: "STT", status: "LOCAL_DRAFT", confidence: 0.96, overlapSeverity: "HIGH",
        speakerStatus: "UNCONFIRMED", persistence: "BROWSER_ONLY", editedBy: "user-1", createdAt, updatedAt: createdAt }]
    });
    expect(review.items[0]).toMatchObject({ type: "DECISION", overlapRiskLevel: "HIGH", speakerRiskLevel: "HIGH" });
    expect(review.evidenceLinks[0]?.requiresHumanReview).toBe(true);
  });
});
