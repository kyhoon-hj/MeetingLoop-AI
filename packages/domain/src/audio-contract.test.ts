import { describe, expect, it } from "vitest";
import {
  assertDecisionEvidenceSafe,
  audioNormalizationResultSchema,
  audioQualityReportSchema,
  overlapRegionSchema,
  vadAnalysisResultSchema
} from "./index";

describe("browser-only audio contracts", () => {
  it("validates a local audio quality report without enabling server persistence", () => {
    const report = audioQualityReportSchema.parse({
      id: "quality-1",
      organizationId: "org-1",
      meetingId: "meeting-1",
      recordingId: "recording-1",
      source: "BROWSER_RECORDING",
      durationMs: 5000,
      sampleRate: 48000,
      channelCount: 1,
      speechRatio: 0.7,
      silenceRatio: 0.2,
      lowVolumeRatio: 0.1,
      clippingRatio: 0,
      noiseRatio: 0.1,
      overlapRatio: 0,
      echoScore: null,
      reverberationScore: null,
      overallScore: 92,
      recommendPreciseAnalysis: false,
      recommendations: ["현재 입력 품질이 안정적입니다."],
      analyzerVersion: "fixture-v1",
      metricsJson: { frameCount: 20 },
      createdAt: "2026-07-15T00:00:00.000Z"
    });

    expect(report.persistence).toBe("BROWSER_ONLY");
    expect(report.overallScore).toBe(92);
  });

  it("never allows HIGH overlap or unconfirmed speakers as automatic decision evidence", () => {
    expect(() => overlapRegionSchema.parse({
      id: "overlap-1",
      organizationId: "org-1",
      meetingId: "meeting-1",
      recordingId: "recording-1",
      startMs: 1000,
      endMs: 2500,
      severity: "HIGH",
      estimatedSpeakerCount: 2,
      confidence: 0.92,
      reviewStatus: "PENDING",
      decisionEvidenceAllowed: true,
      provider: "fixture",
      createdAt: "2026-07-15T00:00:00.000Z"
    })).toThrow("HIGH_OVERLAP_REQUIRES_REVIEW");
    expect(() => assertDecisionEvidenceSafe({ overlapSeverity: "HIGH", speakerStatus: "CONFIRMED" }))
      .toThrow("DECISION_EVIDENCE_REVIEW_REQUIRED");
    expect(() => assertDecisionEvidenceSafe({ overlapSeverity: null, speakerStatus: "UNCONFIRMED" }))
      .toThrow("DECISION_EVIDENCE_REVIEW_REQUIRED");
    expect(() => assertDecisionEvidenceSafe({ overlapSeverity: "LOW", speakerStatus: "CONFIRMED" }))
      .not.toThrow();
  });

  it("validates normalization mapping and VAD without server storage keys", () => {
    const createdAt = "2026-07-15T00:00:00.000Z";
    const artifact = {
      id: "artifact-1",
      organizationId: "org-1",
      meetingId: "meeting-1",
      recordingId: "recording-1",
      kind: "ORIGINAL" as const,
      browserKey: "indexeddb://recordings/source.wav",
      mimeType: "audio/wav",
      durationMs: 1000,
      sampleRate: 16000,
      channelCount: 1,
      retentionUntil: null,
      createdAt
    };
    expect(() => audioNormalizationResultSchema.parse({
      recordingId: "recording-1",
      status: "FALLBACK",
      originalArtifact: artifact,
      analysisArtifact: artifact,
      steps: ["STANDARDIZE_PCM"],
      inputMetrics: { integratedLufs: -20, truePeakDb: -3, noiseFloorDb: -45 },
      outputMetrics: { integratedLufs: -20, truePeakDb: -3, noiseFloorDb: -45 },
      timeMappings: [{ sourceStartMs: 1000, sourceEndMs: 500, artifactStartMs: 0, artifactEndMs: 500 }],
      ffmpegArguments: [],
      fallbackUsed: true,
      warning: "fallback",
      createdAt
    })).toThrow("AUDIO_TIME_MAPPING_INVALID");

    const vad = vadAnalysisResultSchema.parse({
      recordingId: "recording-1",
      provider: "fixture-vad",
      regions: [{
        id: "voice-1",
        organizationId: "org-1",
        meetingId: "meeting-1",
        recordingId: "recording-1",
        startMs: 0,
        endMs: 1000,
        classification: "VOICE",
        confidence: 0.9,
        provider: "fixture-vad",
        createdAt
      }],
      speechRatio: 1,
      silenceRatio: 0,
      noiseRatio: 0,
      createdAt
    });
    expect(vad.persistence).toBe("BROWSER_ONLY");
  });
});
