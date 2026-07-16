import { z } from "zod";
import {
  audioArtifactSchema,
  browserOnlyPersistenceSchema,
  overlapRegionSchema,
  overlapSeveritySchema
} from "./audio";
import { segmentSpeakerAssignmentSchema } from "./speaker";

const transcriptDraftSegmentBaseSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  speakerLabel: z.string().min(1).max(80),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  rawText: z.string().min(1).max(4000),
  normalizedText: z.string().min(1).max(4000),
  editedText: z.string().min(1).max(4000),
  source: z.enum(["LIVE", "MANUAL", "STT"]),
  status: z.literal("LOCAL_DRAFT"),
  confidence: z.number().min(0).max(1).nullable().default(null),
  overlapSeverity: overlapSeveritySchema.nullable().default(null),
  speakerStatus: z.enum(["UNCONFIRMED", "CONFIRMED"]).default("CONFIRMED"),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  editedBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const transcriptDraftSegmentSchema = transcriptDraftSegmentBaseSchema.refine((segment) => segment.endMs > segment.startMs, {
  message: "TRANSCRIPT_DRAFT_TIME_INVALID"
});

export const transcriptDraftSegmentInputSchema = transcriptDraftSegmentBaseSchema.omit({
  id: true,
  editedBy: true,
  createdAt: true,
  updatedAt: true
}).extend({
  clientId: z.string().min(1).max(120)
}).strict();

export const transcriptionRunKindSchema = z.enum([
  "QUICK_RAW",
  "QUICK_PROCESSED",
  "PRECISE_RAW",
  "PRECISE_PROCESSED",
  "OVERLAP_SEPARATED_A",
  "OVERLAP_SEPARATED_B",
  "USER_REQUESTED"
]);

export const transcriptionCandidateSegmentSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  speakerLabel: z.string().min(1).max(80),
  rawText: z.string().min(1).max(4000),
  normalizedText: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1),
  overlapSeverity: overlapSeveritySchema.nullable(),
  speakerStatus: z.enum(["UNCONFIRMED", "CONFIRMED"]),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY")
}).refine((segment) => segment.endMs > segment.startMs, {
  message: "TRANSCRIPT_SEGMENT_TIME_INVALID"
});

export const transcriptionRunSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  kind: transcriptionRunKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  inputArtifactId: z.string().nullable(),
  contextBeforeMs: z.number().int().nonnegative().max(30_000),
  contextAfterMs: z.number().int().nonnegative().max(30_000),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]),
  confidence: z.number().min(0).max(1),
  selected: z.boolean(),
  errorCode: z.string().nullable(),
  segments: z.array(transcriptionCandidateSegmentSchema).min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const quickTranscriptionInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  rawArtifactId: z.string().nullable(),
  processedArtifactId: z.string().nullable(),
  contextWindowMs: z.number().int().min(0).max(30_000).default(1200),
  voiceRegions: z.array(z.object({
    id: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    classification: z.enum(["VOICE", "SILENCE", "NOISE"])
  })).min(1),
  overlapRegions: z.array(overlapRegionSchema),
  speakerAssignments: z.array(segmentSpeakerAssignmentSchema).min(1),
  preview: z.boolean().default(false)
});

export const quickTranscriptionResultSchema = z.object({
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  runs: z.array(transcriptionRunSchema).min(2),
  selectedRunId: z.string().min(1),
  state: z.literal("QUICK_ANALYSIS_READY"),
  createdAt: z.string().datetime()
}).superRefine((result, context) => {
  const selected = result.runs.filter((run) => run.selected);
  if (selected.length !== 1 || selected[0]?.id !== result.selectedRunId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "SELECTED_TRANSCRIPTION_RUN_INVALID" });
  }
});

export const preciseAnalysisReasonSchema = z.enum([
  "LOW_STT_CONFIDENCE",
  "OVERLAP_MEDIUM_HIGH",
  "LOW_SPEAKER_CONFIDENCE",
  "IMPORTANT_KEYWORD",
  "DECISION_CANDIDATE",
  "ASSIGNEE_DEADLINE_CANDIDATE",
  "USER_REQUESTED"
]);

export const preciseAnalysisCandidateSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  segmentId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  priority: z.enum(["HIGH", "NORMAL"]),
  score: z.number().min(0).max(1),
  reasons: z.array(preciseAnalysisReasonSchema).min(1),
  estimatedCostUnits: z.number().int().positive(),
  status: z.enum(["SELECTED", "DEFERRED", "COMPLETED", "FAILED"]),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime()
}).refine((candidate) => candidate.endMs > candidate.startMs, {
  message: "PRECISE_CANDIDATE_TIME_INVALID"
});

export const preciseCandidateSelectionInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  segments: z.array(transcriptionCandidateSegmentSchema).min(1),
  speakerAssignments: z.array(segmentSpeakerAssignmentSchema),
  userRequestedSegmentIds: z.array(z.string().min(1)).default([]),
  maxAnalysisRatio: z.number().min(0.01).max(1).default(0.35)
});

export const preciseCandidateSelectionResultSchema = z.object({
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  candidates: z.array(preciseAnalysisCandidateSchema),
  selectedDurationMs: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().positive(),
  selectedRatio: z.number().min(0).max(1),
  deferredCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});

export const separatedAudioTrackSchema = z.object({
  label: z.enum(["A", "B"]),
  artifact: audioArtifactSchema,
  candidateText: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1),
  speakerStatus: z.literal("UNCONFIRMED")
});

export const sourceSeparationInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  sourceArtifactId: z.string().min(1),
  sourceBrowserKey: z.string().min(1),
  sourceDurationMs: z.number().int().positive(),
  overlapRegion: overlapRegionSchema,
  contextPaddingMs: z.number().int().min(0).max(10_000).default(1200),
  retentionHours: z.number().int().min(1).max(168).default(24),
  decisionCandidate: z.boolean().default(false),
  userRequested: z.boolean().default(false),
  simulateFailure: z.boolean().default(false),
  preview: z.boolean().default(false)
});

export const sourceSeparationResultSchema = z.object({
  recordingId: z.string().min(1),
  overlapRegionId: z.string().min(1),
  provider: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  status: z.enum(["COMPLETED", "FALLBACK"]),
  extractedStartMs: z.number().int().nonnegative(),
  extractedEndMs: z.number().int().positive(),
  tracks: z.array(separatedAudioTrackSchema).max(2),
  candidateConfidence: z.number().min(0).max(1),
  preferredResult: z.enum(["ORIGINAL", "SEPARATED_CANDIDATE"]),
  autoSpeakerConfirmed: z.literal(false),
  fallbackRunId: z.string().nullable(),
  warning: z.string().nullable(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime()
}).superRefine((result, context) => {
  if (result.extractedEndMs <= result.extractedStartMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "SEPARATION_TIME_RANGE_INVALID" });
  }
  if (result.status === "COMPLETED" && result.tracks.length !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "SEPARATION_TRACKS_REQUIRED" });
  }
  if (result.status === "FALLBACK" && result.tracks.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "FALLBACK_TRACKS_NOT_ALLOWED" });
  }
});

export const transcriptWordSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  text: z.string().min(1).max(200),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  speakerClusterId: z.string().nullable(),
  isUncertain: z.boolean()
}).refine((word) => word.endMs > word.startMs, { message: "TRANSCRIPT_WORD_TIME_INVALID" });

export const forcedAlignmentInputSchema = z.object({
  run: transcriptionRunSchema,
  uncertainThreshold: z.number().min(0).max(1).default(0.75)
});

export const transcriptionSelectionEventSchema = z.object({
  id: z.string().min(1),
  recordingId: z.string().min(1),
  previousRunId: z.string().nullable(),
  nextRunId: z.string().min(1),
  actor: z.enum(["AUTOMATION", "USER"]),
  reason: z.string().min(1).max(240),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime()
});

export const preciseTranscriptionInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  quickRun: transcriptionRunSchema,
  candidates: z.array(preciseAnalysisCandidateSchema).min(1),
  separationResults: z.array(sourceSeparationResultSchema),
  simulateFailure: z.boolean().default(false),
  preview: z.boolean().default(false)
});

export const preciseTranscriptionResultSchema = z.object({
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  status: z.enum(["COMPLETED", "FALLBACK"]),
  state: z.enum(["PRECISE_ANALYSIS_READY", "PRECISE_ANALYSIS_FAILED_FALLBACK"]),
  runs: z.array(transcriptionRunSchema).min(1),
  selectedRunId: z.string().min(1),
  words: z.array(transcriptWordSchema),
  history: z.array(transcriptionSelectionEventSchema).min(1),
  fallbackUsed: z.boolean(),
  warning: z.string().nullable(),
  createdAt: z.string().datetime()
}).superRefine((result, context) => {
  const selected = result.runs.filter((run) => run.selected);
  if (selected.length !== 1 || selected[0]?.id !== result.selectedRunId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "PRECISE_SELECTED_RUN_INVALID" });
  }
});

export type TranscriptDraftSegment = z.infer<typeof transcriptDraftSegmentSchema>;
export type TranscriptDraftSegmentInput = z.infer<typeof transcriptDraftSegmentInputSchema>;
export type TranscriptionRunKind = z.infer<typeof transcriptionRunKindSchema>;
export type TranscriptionCandidateSegment = z.infer<typeof transcriptionCandidateSegmentSchema>;
export type TranscriptionRun = z.infer<typeof transcriptionRunSchema>;
export type QuickTranscriptionInput = z.infer<typeof quickTranscriptionInputSchema>;
export type QuickTranscriptionResult = z.infer<typeof quickTranscriptionResultSchema>;
export type PreciseAnalysisReason = z.infer<typeof preciseAnalysisReasonSchema>;
export type PreciseAnalysisCandidate = z.infer<typeof preciseAnalysisCandidateSchema>;
export type PreciseCandidateSelectionInput = z.infer<typeof preciseCandidateSelectionInputSchema>;
export type PreciseCandidateSelectionResult = z.infer<typeof preciseCandidateSelectionResultSchema>;
export type SeparatedAudioTrack = z.infer<typeof separatedAudioTrackSchema>;
export type SourceSeparationInput = z.infer<typeof sourceSeparationInputSchema>;
export type SourceSeparationResult = z.infer<typeof sourceSeparationResultSchema>;
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;
export type ForcedAlignmentInput = z.infer<typeof forcedAlignmentInputSchema>;
export type TranscriptionSelectionEvent = z.infer<typeof transcriptionSelectionEventSchema>;
export type PreciseTranscriptionInput = z.infer<typeof preciseTranscriptionInputSchema>;
export type PreciseTranscriptionResult = z.infer<typeof preciseTranscriptionResultSchema>;
