import { z } from "zod";

export const meetingStatusSchema = z.enum([
  "DRAFT", "RECORDING", "UPLOADING", "PROCESSING", "REVIEW", "APPROVED", "FAILED", "ARCHIVED"
]);

export const meetingTypeSchema = z.enum(["REQUIREMENTS", "WEEKLY", "DECISION", "REVIEW", "GENERAL"]);

export const participantInputSchema = z.object({
  displayName: z.string().min(1).max(80),
  roleLabel: z.string().max(80).default(""),
  organizationLabel: z.string().max(80).default("")
});

export const agendaInputSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(500).default("")
});

export const roleSchema = z.enum(["ORG_ADMIN", "PROJECT_ADMIN", "EDITOR", "MEMBER", "VIEWER", "EXTERNAL"]);

export const userSchema = z.object({
  id: z.string().min(1), email: z.string().email(), displayName: z.string().min(1),
  locale: z.string().default("ko"), timezone: z.string().default("Asia/Seoul"),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});

export const organizationSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), slug: z.string().min(2),
  timezone: z.string().default("Asia/Seoul"), retentionDays: z.number().int().positive(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});

export const membershipSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), userId: z.string().min(1),
  role: roleSchema, status: z.enum(["ACTIVE", "INVITED", "DISABLED"]), createdAt: z.string().datetime()
});

export const projectSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), name: z.string().min(1),
  key: z.string().min(2).max(16), description: z.string().max(500).default(""),
  createdBy: z.string().min(1), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE")
});

export const createProjectInputSchema = z.object({
  organizationId: z.string().min(1), name: z.string().min(1).max(80),
  key: z.string().min(2).max(16).regex(/^[A-Z0-9][A-Z0-9-]*$/), description: z.string().max(500).default("")
});

export const updateProjectInputSchema = z.object({
  organizationId: z.string().min(1), projectId: z.string().min(1), name: z.string().min(1).max(80),
  description: z.string().max(500).default("")
});

export const archiveProjectInputSchema = z.object({ organizationId: z.string().min(1), projectId: z.string().min(1) });
export const restoreProjectInputSchema = archiveProjectInputSchema;

export const registerOrganizationInputSchema = z.object({
  email: z.string().email(), password: z.string().min(8).max(128), displayName: z.string().min(1).max(80),
  organizationName: z.string().min(1).max(100),
  organizationSlug: z.string().min(2).max(40).regex(/^[a-z0-9][-a-z0-9]*$/),
  timezone: z.string().default("Asia/Seoul")
});

export const meetingSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), projectId: z.string().min(1),
  title: z.string().min(1), titleStatus: z.enum(["PROVISIONAL", "CONFIRMED"]), meetingType: meetingTypeSchema,
  status: meetingStatusSchema, startedAt: z.string().datetime(), endedAt: z.string().datetime().nullable(),
  timezone: z.string().default("Asia/Seoul"), sourceType: z.enum(["BROWSER_RECORDING", "FILE_UPLOAD", "IMPORT"]),
  recordingConsentAt: z.string().datetime().nullable(), recordingConsentBy: z.string().nullable().default(null),
  recordingConsentVersion: z.string().nullable().default(null), createdBy: z.string().min(1),
  approvedBy: z.string().nullable(), approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});

export const participantSchema = z.object({
  id: z.string().min(1), meetingId: z.string().min(1), userId: z.string().nullable(), displayName: z.string().min(1),
  roleLabel: z.string(), organizationLabel: z.string(), speakerClusterId: z.string().nullable(),
  identityStatus: z.enum(["UNKNOWN", "SUGGESTED", "CONFIRMED"]),
  identityConfidence: z.number().min(0).max(1).nullable(),
  identitySource: z.enum(["MANUAL", "CALENDAR", "SELF_INTRO", "VOICE_PROFILE", "UNKNOWN"]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});

export const agendaSchema = z.object({
  id: z.string().min(1), meetingId: z.string().min(1), parentAgendaId: z.string().nullable(), title: z.string().min(1),
  summary: z.string(), sequence: z.number().int().nonnegative(), startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(), status: z.enum(["PLANNED", "DETECTED", "CONFIRMED"]),
  source: z.enum(["PRESET", "AI", "USER"]), confidence: z.number().min(0).max(1).nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});

export const recordingSchema = z.object({
  id: z.string().min(1), meetingId: z.string().min(1), originalFileName: z.string().min(1), mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(), durationMs: z.number().int().nonnegative(), storagePolicy: z.literal("LOCAL_ONLY"),
  processingStatus: meetingStatusSchema, createdAt: z.string().datetime()
});

export const createMeetingInputSchema = z.object({
  organizationId: z.string().min(1), projectId: z.string().min(1), title: z.string().min(1).max(120),
  meetingType: meetingTypeSchema, participants: z.array(participantInputSchema).min(1).max(30),
  agendas: z.array(agendaInputSchema).min(1).max(20), consentConfirmed: z.literal(true),
  fixtureFileName: z.string().min(1).max(160), fixtureMimeType: z.string().min(1).max(120).default("audio/wav"),
  fixtureSizeBytes: z.number().int().nonnegative().default(1024)
});

export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
export type MeetingType = z.infer<typeof meetingTypeSchema>;
export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type ArchiveProjectInput = z.infer<typeof archiveProjectInputSchema>;
export type RestoreProjectInput = z.infer<typeof restoreProjectInputSchema>;
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationInputSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type Agenda = z.infer<typeof agendaSchema>;
export type Recording = z.infer<typeof recordingSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingInputSchema>;

export const privacyPolicyVersion = "2026-07-16";

export const meetingDeletionInputSchema = z.object({
  organizationId: z.string().min(1), meetingId: z.string().min(1),
  confirmation: z.string().min(1), idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/)
}).superRefine((value, context) => {
  if (value.confirmation !== value.meetingId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmation"], message: "MEETING_DELETE_CONFIRMATION_MISMATCH" });
  }
});

export type MeetingDeletionInput = z.infer<typeof meetingDeletionInputSchema>;

export function assertSameOrganization(leftOrganizationId: string, rightOrganizationId: string): void {
  if (leftOrganizationId !== rightOrganizationId) throw new Error("ORGANIZATION_SCOPE_VIOLATION");
}

export function assertProjectManagerRole(role: Role): void {
  if (role !== "ORG_ADMIN" && role !== "PROJECT_ADMIN") throw new Error("PROJECT_MANAGE_FORBIDDEN");
}

export function assertMeetingEditorRole(role: Role): void {
  if (role !== "ORG_ADMIN" && role !== "PROJECT_ADMIN" && role !== "EDITOR") throw new Error("MEETING_CREATE_FORBIDDEN");
}

const contentEditorRoles: ReadonlySet<Role> = new Set(["ORG_ADMIN", "PROJECT_ADMIN", "EDITOR"]);

export function assertTranscriptEditorRole(role: Role): void {
  if (!contentEditorRoles.has(role)) throw new Error("TRANSCRIPT_EDIT_FORBIDDEN");
}

export function assertMinutesEditorRole(role: Role): void {
  if (!contentEditorRoles.has(role)) throw new Error("MINUTES_EDIT_FORBIDDEN");
}

export function assertMinutesConfirmerRole(role: Role): void {
  if (!contentEditorRoles.has(role)) throw new Error("MINUTES_CONFIRM_FORBIDDEN");
}

export function assertMeetingDeletionRole(role: Role): void {
  if (role !== "ORG_ADMIN" && role !== "PROJECT_ADMIN") throw new Error("MEETING_DELETE_FORBIDDEN");
}
