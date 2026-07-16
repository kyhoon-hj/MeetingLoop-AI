import { z } from "zod";
import { browserOnlyPersistenceSchema, overlapSeveritySchema } from "./audio";
import { transcriptDraftSegmentSchema } from "./transcript-draft";

export const projectDictionaryTermSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  projectId: z.string().nullable(),
  term: z.string().trim().min(1).max(160),
  aliases: z.array(z.string().trim().min(1).max(160)).max(20),
  category: z.enum(["PRODUCT", "ORGANIZATION", "PERSON", "TECHNICAL", "OTHER"]),
  source: z.enum(["MANUAL", "IMPORT", "REPEATED_CORRECTION"]),
  correctionCount: z.number().int().nonnegative(),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const upsertDictionaryTermInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().nullable(),
  term: z.string().trim().min(1).max(160),
  aliases: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  category: z.enum(["PRODUCT", "ORGANIZATION", "PERSON", "TECHNICAL", "OTHER"]).default("TECHNICAL"),
  source: z.enum(["MANUAL", "IMPORT", "REPEATED_CORRECTION"]).default("MANUAL")
});

export const dictionaryImportInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  rows: z.array(z.object({
    term: z.string().trim().min(1).max(160),
    aliases: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
    category: z.enum(["PRODUCT", "ORGANIZATION", "PERSON", "TECHNICAL", "OTHER"]).default("TECHNICAL")
  })).min(1).max(500)
});

export const dictionaryApplicationEventSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  projectId: z.string().nullable(),
  meetingId: z.string().min(1),
  segmentId: z.string().min(1),
  termId: z.string().min(1),
  alias: z.string().min(1),
  replacement: z.string().min(1),
  beforeText: z.string().min(1),
  afterText: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime()
});

export const dictionarySuggestionSchema = z.object({
  alias: z.string().min(1),
  replacement: z.string().min(1),
  occurrenceCount: z.number().int().min(2),
  status: z.literal("PENDING")
});

export const dictionaryApplyResultSchema = z.object({
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  segments: z.array(transcriptDraftSegmentSchema),
  events: z.array(dictionaryApplicationEventSchema),
  suggestions: z.array(dictionarySuggestionSchema)
});

export const speakerReviewScopeSchema = z.enum(["MEETING", "AGENDA", "SEGMENT"]);

export const assignSpeakerClusterInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  clusterId: z.string().min(1),
  participantId: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
  scope: speakerReviewScopeSchema,
  segmentId: z.string().nullable(),
  agendaId: z.string().nullable()
}).superRefine((input, context) => {
  if (input.scope === "SEGMENT" && !input.segmentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "SEGMENT_SCOPE_REQUIRES_SEGMENT" });
  }
  if (input.scope === "AGENDA" && !input.agendaId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "AGENDA_SCOPE_REQUIRES_AGENDA" });
  }
});

export const mergeSpeakerClustersInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  targetClusterId: z.string().min(1),
  sourceClusterIds: z.array(z.string().min(1)).min(1).max(7)
});

export const splitSpeakerClusterInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  clusterId: z.string().min(1),
  segmentIds: z.array(z.string().min(1)).min(1)
});

export const transcriptEditEventSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  segmentId: z.string().min(1),
  field: z.enum(["NORMALIZED_TEXT", "EDITED_TEXT", "SPEAKER", "STATUS"]),
  previousValue: z.string(),
  nextValue: z.string(),
  actorId: z.string().min(1),
  source: z.enum(["USER", "DICTIONARY", "REPROCESS"]),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime()
});

export const statementTypeSchema = z.enum([
  "BACKGROUND",
  "QUESTION",
  "ANSWER",
  "OPINION",
  "PROPOSAL",
  "ISSUE",
  "RISK",
  "DECISION",
  "DEFERRED",
  "REJECTED",
  "ACTION_ITEM",
  "REQUIREMENT_CHANGE",
  "DOCUMENT_CHANGE",
  "OPEN_QUESTION",
  "SMALL_TALK"
]);

export const reviewRiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const extractedItemReviewStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const extractedItemSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  agendaId: z.string().nullable(),
  type: statementTypeSchema,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(4000),
  assigneeParticipantId: z.string().nullable(),
  assigneeText: z.string().max(120).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dueDateExpression: z.string().max(120).nullable(),
  confidence: z.number().min(0).max(1),
  reviewStatus: extractedItemReviewStatusSchema,
  audioRiskLevel: reviewRiskLevelSchema,
  speakerRiskLevel: reviewRiskLevelSchema,
  overlapRiskLevel: reviewRiskLevelSchema,
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const evidenceLinkSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  entityType: z.literal("EXTRACTED_ITEM"),
  entityId: z.string().min(1),
  segmentId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  evidenceText: z.string().min(1).max(4000),
  evidenceConfidence: z.number().min(0).max(1),
  validationStatus: z.enum(["PENDING", "VALID", "INVALID"]),
  requiresHumanReview: z.boolean(),
  validatedBy: z.string().nullable(),
  validatedAt: z.string().datetime().nullable(),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime()
}).refine((evidence) => evidence.endMs > evidence.startMs, {
  message: "EVIDENCE_TIME_RANGE_INVALID"
});

export const reviewEventSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  itemId: z.string().nullable(),
  action: z.enum(["CREATED", "EDITED", "EVIDENCE_VALIDATED", "APPROVED", "REJECTED", "COMPLETED"]),
  actorId: z.string().nullable(),
  note: z.string().max(1000).nullable(),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime()
});

export const meetingReviewAnalysisInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  meetingStartedAt: z.string().datetime(),
  timezone: z.string().min(1),
  participants: z.array(z.object({
    id: z.string().min(1),
    displayName: z.string().min(1).max(80)
  })).max(30),
  segments: z.array(transcriptDraftSegmentSchema).min(1).max(1000)
});

export const meetingReviewAnalysisResultSchema = z.object({
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  items: z.array(extractedItemSchema),
  evidenceLinks: z.array(evidenceLinkSchema),
  provider: z.string().min(1),
  createdAt: z.string().datetime()
});

export const reviewQueueEntrySchema = z.object({
  item: extractedItemSchema,
  evidence: evidenceLinkSchema,
  segment: transcriptDraftSegmentSchema,
  priority: z.number().int().nonnegative(),
  reasons: z.array(z.string().min(1)).min(1),
  canApprove: z.boolean(),
  blockers: z.array(z.string().min(1))
});

export const meetingReviewQueueSchema = z.object({
  meetingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  entries: z.array(reviewQueueEntrySchema),
  progress: z.object({
    reviewed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    percent: z.number().int().min(0).max(100),
    canComplete: z.boolean(),
    completed: z.boolean()
  }),
  history: z.array(reviewEventSchema)
});

export const updateExtractedItemInputSchema = z.object({
  organizationId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(4000).optional(),
  assigneeParticipantId: z.string().nullable().optional(),
  assigneeText: z.string().max(120).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueDateExpression: z.string().max(120).nullable().optional()
}).refine((input) => Object.keys(input).some((key) => key !== "organizationId"), {
  message: "REVIEW_ITEM_CHANGE_REQUIRED"
});

export const reviewItemActionInputSchema = z.object({
  organizationId: z.string().min(1),
  note: z.string().trim().max(1000).nullable().default(null)
});

export const reviewEvidenceInputSchema = z.object({
  organizationId: z.string().min(1),
  action: z.enum(["CONFIRM", "UPDATE"]),
  evidenceText: z.string().trim().min(1).max(4000).optional()
}).superRefine((input, context) => {
  if (input.action === "UPDATE" && !input.evidenceText) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "EVIDENCE_TEXT_REQUIRED" });
  }
});

export const completeMeetingReviewInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1)
});

export const decisionEvidenceRiskSchema = z.object({
  overlapSeverity: overlapSeveritySchema.nullable(),
  speakerStatus: z.enum(["UNCONFIRMED", "CONFIRMED"])
});

export type ProjectDictionaryTerm = z.infer<typeof projectDictionaryTermSchema>;
export type UpsertDictionaryTermInput = z.infer<typeof upsertDictionaryTermInputSchema>;
export type DictionaryImportInput = z.infer<typeof dictionaryImportInputSchema>;
export type DictionaryApplicationEvent = z.infer<typeof dictionaryApplicationEventSchema>;
export type DictionarySuggestion = z.infer<typeof dictionarySuggestionSchema>;
export type DictionaryApplyResult = z.infer<typeof dictionaryApplyResultSchema>;
export type SpeakerReviewScope = z.infer<typeof speakerReviewScopeSchema>;
export type AssignSpeakerClusterInput = z.infer<typeof assignSpeakerClusterInputSchema>;
export type MergeSpeakerClustersInput = z.infer<typeof mergeSpeakerClustersInputSchema>;
export type SplitSpeakerClusterInput = z.infer<typeof splitSpeakerClusterInputSchema>;
export type TranscriptEditEvent = z.infer<typeof transcriptEditEventSchema>;
export type StatementType = z.infer<typeof statementTypeSchema>;
export type ReviewRiskLevel = z.infer<typeof reviewRiskLevelSchema>;
export type ExtractedItemReviewStatus = z.infer<typeof extractedItemReviewStatusSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type ReviewEvent = z.infer<typeof reviewEventSchema>;
export type MeetingReviewAnalysisInput = z.infer<typeof meetingReviewAnalysisInputSchema>;
export type MeetingReviewAnalysisResult = z.infer<typeof meetingReviewAnalysisResultSchema>;
export type ReviewQueueEntry = z.infer<typeof reviewQueueEntrySchema>;
export type MeetingReviewQueue = z.infer<typeof meetingReviewQueueSchema>;
export type UpdateExtractedItemInput = z.infer<typeof updateExtractedItemInputSchema>;
export type ReviewItemActionInput = z.infer<typeof reviewItemActionInputSchema>;
export type ReviewEvidenceInput = z.infer<typeof reviewEvidenceInputSchema>;
export type CompleteMeetingReviewInput = z.infer<typeof completeMeetingReviewInputSchema>;
export type DecisionEvidenceRisk = z.infer<typeof decisionEvidenceRiskSchema>;

export function assertDecisionEvidenceSafe(risk: DecisionEvidenceRisk): void {
  const parsed = decisionEvidenceRiskSchema.parse(risk);
  if (parsed.overlapSeverity === "HIGH" || parsed.speakerStatus !== "CONFIRMED") {
    throw new Error("DECISION_EVIDENCE_REVIEW_REQUIRED");
  }
}

export function statementConfidenceThreshold(type: StatementType): number {
  if (type === "DECISION") return 0.88;
  if (type === "ACTION_ITEM") return 0.8;
  if (type === "PROPOSAL" || type === "RISK" || type === "OPEN_QUESTION") return 0.75;
  return 0.65;
}

export function canAutomaticallyConfirmExtractedItem(item: ExtractedItem, evidence: EvidenceLink): boolean {
  if (item.reviewStatus !== "PENDING" || evidence.validationStatus !== "VALID" || evidence.requiresHumanReview) {
    return false;
  }
  if (item.type === "DECISION" || item.type === "PROPOSAL") return false;
  if (item.audioRiskLevel === "HIGH" || item.speakerRiskLevel === "HIGH" || item.overlapRiskLevel === "HIGH") {
    return false;
  }
  return item.confidence >= statementConfidenceThreshold(item.type);
}
