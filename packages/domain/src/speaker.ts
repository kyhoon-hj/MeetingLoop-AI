import { z } from "zod";
import { browserOnlyPersistenceSchema, overlapRegionSchema, voiceRegionSchema } from "./audio";

export const segmentSpeakerAssignmentSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  speakerClusterId: z.string().nullable(),
  participantId: z.string().nullable(),
  speakerLabel: z.string().min(1).max(80),
  assignmentRole: z.enum(["PRIMARY", "SECONDARY", "MULTIPLE"]),
  confidence: z.number().min(0).max(1),
  status: z.enum(["UNCONFIRMED", "CONFIRMED"]),
  source: z.enum(["DIARIZATION", "MANUAL", "VOICE_PROFILE"]),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const speakerClusterSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  label: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
  representativeRegionIds: z.array(z.string().min(1)).max(3),
  status: z.enum(["ACTIVE", "MERGED", "SPLIT"]),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const speakerAssignmentEventSchema = z.object({
  id: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  assignmentId: z.string().min(1),
  eventType: z.enum(["DETECTED", "CONFIRMED", "REASSIGNED", "MERGED", "SPLIT"]),
  previousClusterId: z.string().nullable(),
  nextClusterId: z.string().nullable(),
  actorId: z.string().nullable(),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  createdAt: z.string().datetime()
});

export const diarizationSuggestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["MERGE", "SPLIT"]),
  clusterIds: z.array(z.string().min(1)).min(1).max(4),
  reason: z.string().min(1).max(240),
  confidence: z.number().min(0).max(1),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED"])
});

export const diarizationInputSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  expectedSpeakerCount: z.number().int().min(1).max(8),
  participantNames: z.array(z.string().trim().min(1).max(80)).max(8),
  voiceRegions: z.array(voiceRegionSchema).min(1),
  overlapRegions: z.array(overlapRegionSchema),
  preview: z.boolean().default(false)
});

export const diarizationResultSchema = z.object({
  recordingId: z.string().min(1),
  persistence: browserOnlyPersistenceSchema.default("BROWSER_ONLY"),
  provider: z.string().min(1),
  clusters: z.array(speakerClusterSchema).min(1).max(8),
  assignments: z.array(segmentSpeakerAssignmentSchema).min(1),
  suggestions: z.array(diarizationSuggestionSchema),
  history: z.array(speakerAssignmentEventSchema).min(1),
  createdAt: z.string().datetime()
});

export type SegmentSpeakerAssignment = z.infer<typeof segmentSpeakerAssignmentSchema>;
export type SpeakerCluster = z.infer<typeof speakerClusterSchema>;
export type SpeakerAssignmentEvent = z.infer<typeof speakerAssignmentEventSchema>;
export type DiarizationSuggestion = z.infer<typeof diarizationSuggestionSchema>;
export type DiarizationInput = z.infer<typeof diarizationInputSchema>;
export type DiarizationResult = z.infer<typeof diarizationResultSchema>;
