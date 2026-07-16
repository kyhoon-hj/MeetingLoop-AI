import { z } from "zod";

export const browserOnlyPersistenceSchema = z.literal("BROWSER_ONLY");

export const audioQualitySourceSchema = z.enum([
  "BROWSER_INPUT_TEST",
  "BROWSER_RECORDING",
  "WORKER_FIXTURE"
]);

export const audioQualityFrameSchema = z.object({
  sequence: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  rms: z.number().min(0).max(1),
  peak: z.number().min(0).max(1),
  zeroCrossingRate: z.number().min(0).max(1)
}).refine((frame) => frame.endMs > frame.startMs, {
  message: "AUDIO_FRAME_TIME_RANGE_INVALID"
});

export const audioQualityReportSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  source: audioQualitySourceSchema,
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  durationMs: z.number().int().positive(),
  sampleRate: z.number().int().min(8000).max(192000),
  channelCount: z.number().int().min(1).max(8),
  speechRatio: z.number().min(0).max(1),
  silenceRatio: z.number().min(0).max(1),
  lowVolumeRatio: z.number().min(0).max(1),
  clippingRatio: z.number().min(0).max(1),
  noiseRatio: z.number().min(0).max(1),
  overlapRatio: z.number().min(0).max(1),
  echoScore: z.number().min(0).max(1).nullable(),
  reverberationScore: z.number().min(0).max(1).nullable(),
  overallScore: z.number().int().min(0).max(100),
  recommendPreciseAnalysis: z.boolean(),
  recommendations: z.array(z.string().min(1).max(240)).max(8),
  analyzerVersion: z.string().min(1),
  metricsJson: z.record(z.unknown()),
  createdAt: z.string().datetime()
});

export const audioQualityAnalysisInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  source: audioQualitySourceSchema,
  durationMs: z.number().int().positive().max(14_400_000),
  sampleRate: z.number().int().min(8000).max(192000),
  channelCount: z.number().int().min(1).max(8),
  preview: z.boolean().default(false),
  frames: z.array(audioQualityFrameSchema).min(1).max(57_600)
});

export const audioArtifactKindSchema = z.enum([
  "ORIGINAL",
  "NORMALIZED",
  "NOISE_REDUCED",
  "DEREVERBERATED",
  "SEPARATED_TRACK"
]);

export const audioArtifactSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  kind: audioArtifactKindSchema,
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  browserKey: z.string().min(1),
  mimeType: z.string().min(1),
  durationMs: z.number().int().positive(),
  sampleRate: z.number().int().min(8000).max(192000),
  channelCount: z.number().int().min(1).max(8),
  retentionUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});

export const audioTimeMappingSchema = z.object({
  sourceStartMs: z.number().int().nonnegative(),
  sourceEndMs: z.number().int().positive(),
  artifactStartMs: z.number().int().nonnegative(),
  artifactEndMs: z.number().int().positive()
}).superRefine((mapping, context) => {
  if (mapping.sourceEndMs <= mapping.sourceStartMs || mapping.artifactEndMs <= mapping.artifactStartMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "AUDIO_TIME_MAPPING_INVALID" });
  }
});

export const audioNormalizationMetricsSchema = z.object({
  integratedLufs: z.number().min(-80).max(10),
  truePeakDb: z.number().min(-80).max(10),
  noiseFloorDb: z.number().min(-120).max(10)
});

export const audioNormalizationInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  sourceBrowserKey: z.string().min(1),
  originalMimeType: z.string().min(1),
  durationMs: z.number().int().positive().max(14_400_000),
  sampleRate: z.number().int().min(8000).max(192000),
  channelCount: z.number().int().min(1).max(8),
  targetSampleRate: z.number().int().min(8000).max(48000).default(16000),
  enableNoiseReduction: z.boolean().default(true),
  enableDereverberation: z.boolean().default(false),
  inputMetrics: audioNormalizationMetricsSchema
});

export const audioNormalizationResultSchema = z.object({
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  status: z.enum(["COMPLETED", "FALLBACK"]),
  originalArtifact: audioArtifactSchema,
  analysisArtifact: audioArtifactSchema,
  steps: z.array(z.enum([
    "STANDARDIZE_PCM",
    "LOUDNESS_NORMALIZE",
    "NOISE_REDUCTION",
    "DEREVERBERATION"
  ])).min(1),
  inputMetrics: audioNormalizationMetricsSchema,
  outputMetrics: audioNormalizationMetricsSchema,
  timeMappings: z.array(audioTimeMappingSchema).min(1),
  ffmpegArguments: z.array(z.string()),
  fallbackUsed: z.boolean(),
  warning: z.string().nullable(),
  createdAt: z.string().datetime()
});

export const voiceRegionSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  classification: z.enum(["VOICE", "SILENCE", "NOISE"]),
  confidence: z.number().min(0).max(1),
  provider: z.string().min(1),
  createdAt: z.string().datetime()
}).refine((region) => region.endMs > region.startMs, {
  message: "VOICE_REGION_TIME_RANGE_INVALID"
});

export const vadAnalysisInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  durationMs: z.number().int().positive().max(14_400_000),
  preview: z.boolean().default(false),
  frames: z.array(audioQualityFrameSchema).min(1).max(57_600)
});

export const vadAnalysisResultSchema = z.object({
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  provider: z.string().min(1),
  regions: z.array(voiceRegionSchema).min(1),
  speechRatio: z.number().min(0).max(1),
  silenceRatio: z.number().min(0).max(1),
  noiseRatio: z.number().min(0).max(1),
  createdAt: z.string().datetime()
});

export const overlapSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const overlapRegionSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  severity: overlapSeveritySchema,
  estimatedSpeakerCount: z.number().int().min(2).max(8),
  confidence: z.number().min(0).max(1),
  reviewStatus: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
  decisionEvidenceAllowed: z.boolean(),
  provider: z.string().min(1),
  createdAt: z.string().datetime()
}).refine((region) => region.endMs > region.startMs, {
  message: "OVERLAP_REGION_TIME_RANGE_INVALID"
}).superRefine((region, context) => {
  if (region.severity === "HIGH" && region.decisionEvidenceAllowed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "HIGH_OVERLAP_REQUIRES_REVIEW",
      path: ["decisionEvidenceAllowed"]
    });
  }
});

export const overlapFeatureFrameSchema = audioQualityFrameSchema.and(z.object({
  overlapProbability: z.number().min(0).max(1).optional()
}));

export const overlapAnalysisInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  durationMs: z.number().int().positive().max(14_400_000),
  preview: z.boolean().default(false),
  frames: z.array(overlapFeatureFrameSchema).min(1).max(57_600)
});

export const overlapAnalysisResultSchema = z.object({
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  provider: z.string().min(1),
  regions: z.array(overlapRegionSchema),
  overlapRatio: z.number().min(0).max(1),
  highReviewCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});

export type BrowserOnlyPersistence = z.infer<typeof browserOnlyPersistenceSchema>;
export type AudioQualitySource = z.infer<typeof audioQualitySourceSchema>;
export type AudioQualityFrame = z.infer<typeof audioQualityFrameSchema>;
export type AudioQualityReport = z.infer<typeof audioQualityReportSchema>;
export type AudioQualityAnalysisInput = z.infer<typeof audioQualityAnalysisInputSchema>;
export type AudioArtifactKind = z.infer<typeof audioArtifactKindSchema>;
export type AudioArtifact = z.infer<typeof audioArtifactSchema>;
export type AudioTimeMapping = z.infer<typeof audioTimeMappingSchema>;
export type AudioNormalizationMetrics = z.infer<typeof audioNormalizationMetricsSchema>;
export type AudioNormalizationInput = z.infer<typeof audioNormalizationInputSchema>;
export type AudioNormalizationResult = z.infer<typeof audioNormalizationResultSchema>;
export type VoiceRegion = z.infer<typeof voiceRegionSchema>;
export type VadAnalysisInput = z.infer<typeof vadAnalysisInputSchema>;
export type VadAnalysisResult = z.infer<typeof vadAnalysisResultSchema>;
export type OverlapSeverity = z.infer<typeof overlapSeveritySchema>;
export type OverlapRegion = z.infer<typeof overlapRegionSchema>;
export type OverlapFeatureFrame = z.infer<typeof overlapFeatureFrameSchema>;
export type OverlapAnalysisInput = z.infer<typeof overlapAnalysisInputSchema>;
export type OverlapAnalysisResult = z.infer<typeof overlapAnalysisResultSchema>;
