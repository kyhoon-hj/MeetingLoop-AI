import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@meetingloop/auth";
import type { Pool, PoolClient } from "pg";
import {
  assertMeetingEditorRole,
  assertMeetingDeletionRole,
  assertMinutesConfirmerRole,
  assertMinutesEditorRole,
  assertProjectManagerRole,
  assertTranscriptEditorRole,
  archiveProjectInputSchema,
  createMeetingInputSchema,
  createProjectInputSchema,
  generateMinutesInputSchema,
  registerOrganizationInputSchema,
  restoreProjectInputSchema,
  saveMinutesInputSchema,
  saveTranscriptInputSchema,
  saveTranscriptSegmentsInputSchema,
  meetingMinutesSchema,
  meetingDeletionInputSchema,
  privacyPolicyVersion,
  transcriptDocumentSchema,
  updateProjectInputSchema,
  type Agenda,
  type ArchiveProjectInput,
  type CreateMeetingInput,
  type CreateProjectInput,
  type GenerateMinutesInput,
  type Meeting,
  type MeetingDeletionInput,
  type MeetingMinutes,
  type MinutesRevision,
  type Membership,
  type Organization,
  type Participant,
  type Project,
  type Recording,
  type RegisterOrganizationInput,
  type RestoreProjectInput,
  type Role,
  type SaveMinutesInput,
  type SaveTranscriptInput,
  type SaveTranscriptSegmentsInput,
  type TranscriptDocument,
  type TranscriptRevision,
  type TranscriptSegment,
  type UpdateProjectInput,
  type User
} from "@meetingloop/domain";
import { getDatabasePool } from "./pool";
import { withTransaction } from "./transaction";
import {
  executeIdempotentMutation,
  type ContentMutationOptions
} from "./mutation-receipts";

export type HealthStatus = "ok" | "degraded";

export interface DatabaseHealth {
  status: HealthStatus;
  databaseUrlConfigured: boolean;
  checkedAt: string;
  responseTimeMs?: number;
  errorCode?: "DATABASE_URL_MISSING" | "DATABASE_UNAVAILABLE";
}

export function getDatabaseHealth(env: NodeJS.ProcessEnv = process.env): DatabaseHealth {
  return {
    status: env.DATABASE_URL ? "ok" : "degraded",
    databaseUrlConfigured: Boolean(env.DATABASE_URL),
    checkedAt: new Date().toISOString()
  };
}

export async function checkDatabaseHealth(
  env: NodeJS.ProcessEnv = process.env,
  pool?: Pool
): Promise<DatabaseHealth> {
  const startedAt = performance.now();
  if (!env.DATABASE_URL) {
    return {
      status: "degraded",
      databaseUrlConfigured: false,
      checkedAt: new Date().toISOString(),
      responseTimeMs: Math.round(performance.now() - startedAt),
      errorCode: "DATABASE_URL_MISSING"
    };
  }

  try {
    await (pool ?? getDatabasePool()).query("SELECT 1");
    return {
      status: "ok",
      databaseUrlConfigured: true,
      checkedAt: new Date().toISOString(),
      responseTimeMs: Math.round(performance.now() - startedAt)
    };
  } catch {
    return {
      status: "degraded",
      databaseUrlConfigured: true,
      checkedAt: new Date().toISOString(),
      responseTimeMs: Math.round(performance.now() - startedAt),
      errorCode: "DATABASE_UNAVAILABLE"
    };
  }
}

export const requiredSchemaMigration = "0007_privacy_retention_operations.sql";

export async function checkRequiredSchemaMigration(
  filename = requiredSchemaMigration
): Promise<{ status: "ok" | "missing" | "unavailable"; filename: string }> {
  try {
    const result = await getDatabasePool().query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [filename]
    );
    return { status: result.rowCount === 1 ? "ok" : "missing", filename };
  } catch {
    return { status: "unavailable", filename };
  }
}

export async function assertRequiredSchemaMigration(filename = requiredSchemaMigration): Promise<void> {
  const status = await checkRequiredSchemaMigration(filename);
  if (status.status !== "ok") throw new Error(status.status === "missing" ? "DATABASE_SCHEMA_OUTDATED" : "DATABASE_UNAVAILABLE");
}

export { closeDatabasePool, createDatabasePool, getDatabasePool, getDatabasePoolConfig } from "./pool";
export { withTransaction } from "./transaction";
export {
  MutationIdempotencyConflictError,
  MutationInProgressError,
  type ContentMutationOperation,
  type ContentMutationOptions
} from "./mutation-receipts";

export interface Session {
  user: User;
  organization: Organization;
  membership: Membership;
}

export interface Workspace extends Session {
  projects: Project[];
  archivedProjects: Project[];
  meetings: MeetingSummary[];
}

export interface MeetingBundle {
  meeting: Meeting;
  participants: Participant[];
  agendas: Agenda[];
  recording: Recording;
}

export interface MeetingSummary {
  meeting: Meeting;
  projectName: string;
  participantCount: number;
  agendaCount: number;
  recording: Recording | null;
  transcriptSegmentCount: number;
  minutes: MeetingMinutes | null;
}

export interface MeetingListItem {
  id: string;
  title: string;
  projectName: string;
  startedAt: string;
  status: Meeting["status"];
  participantNames: string[];
  transcriptConfirmed: boolean;
  transcriptVersion: number | null;
  minutesConfirmed: boolean;
  minutesVersion: number | null;
  updatedByName: string;
  updatedAt: string;
}

export interface MeetingListPage {
  items: MeetingListItem[];
  nextCursor: string | null;
  totalCount: number;
}

export interface MeetingListOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  q?: string | undefined;
  projectId?: string | undefined;
  status?: Meeting["status"] | undefined;
  meetingType?: Meeting["meetingType"] | undefined;
  transcriptStatus?: "CONFIRMED" | "PENDING" | undefined;
  minutesStatus?: "CONFIRMED" | "PENDING" | undefined;
  createdBy?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface MeetingFilterOptions {
  projects: Array<{ id: string; name: string }>;
  creators: Array<{ id: string; displayName: string }>;
}

export interface MeetingRevisionSummary {
  id: string;
  contentType: "TRANSCRIPT" | "MINUTES";
  version: number;
  changedBy: string;
  changedByName: string;
  createdAt: string;
}

export interface MeetingDetailRecord {
  meeting: Meeting;
  projectName: string;
  participants: Participant[];
  agendas: Agenda[];
  transcript: TranscriptDocument | null;
  minutes: MeetingMinutes | null;
  revisions: MeetingRevisionSummary[];
}

export interface MeetingDeletionReceipt {
  requestId: string;
  organizationId: string;
  meetingId: string;
  reason: "USER_REQUEST" | "RETENTION_EXPIRED";
  requestedAt: string;
  purgeAfter: string;
}

export interface RetentionSweepResult {
  scheduled: number;
  purged: number;
  purgedMeetingIds: string[];
}

type Row = Record<string, unknown>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function nullableIso(value: unknown): string | null {
  return value == null ? null : iso(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function jsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") return JSON.parse(value) as T[];
  return [];
}

function mapUser(row: Row): User {
  return {
    id: String(row.id), email: String(row.email), displayName: String(row.display_name),
    locale: String(row.locale), timezone: String(row.timezone),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

function mapOrganization(row: Row): Organization {
  return {
    id: String(row.id), name: String(row.name), slug: String(row.slug), timezone: String(row.timezone),
    retentionDays: numberValue(row.retention_days), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

function mapMembership(row: Row): Membership {
  return {
    id: String(row.id), organizationId: String(row.organization_id), userId: String(row.user_id),
    role: String(row.role) as Role, status: String(row.status) as Membership["status"], createdAt: iso(row.created_at)
  };
}

function mapProject(row: Row): Project {
  return {
    id: String(row.id), organizationId: String(row.organization_id), name: String(row.name),
    key: String(row.key), description: String(row.description), status: String(row.status) as Project["status"],
    createdBy: String(row.created_by), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

function mapMeeting(row: Row): Meeting {
  return {
    id: String(row.id), organizationId: String(row.organization_id), projectId: String(row.project_id),
    title: String(row.title), titleStatus: String(row.title_status) as Meeting["titleStatus"],
    meetingType: String(row.meeting_type) as Meeting["meetingType"], status: String(row.status) as Meeting["status"],
    startedAt: iso(row.started_at), endedAt: nullableIso(row.ended_at), timezone: String(row.timezone),
    sourceType: String(row.source_type) as Meeting["sourceType"], recordingConsentAt: nullableIso(row.recording_consent_at),
    recordingConsentBy: row.recording_consent_by == null ? null : String(row.recording_consent_by),
    recordingConsentVersion: row.recording_consent_version == null ? null : String(row.recording_consent_version),
    createdBy: String(row.created_by), approvedBy: row.approved_by == null ? null : String(row.approved_by),
    approvedAt: nullableIso(row.approved_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

function mapParticipant(row: Row): Participant {
  return {
    id: String(row.id), meetingId: String(row.meeting_id), userId: row.user_id == null ? null : String(row.user_id),
    displayName: String(row.display_name), roleLabel: String(row.role_label), organizationLabel: String(row.organization_label),
    speakerClusterId: row.speaker_cluster_id == null ? null : String(row.speaker_cluster_id),
    identityStatus: String(row.identity_status) as Participant["identityStatus"],
    identityConfidence: row.identity_confidence == null ? null : numberValue(row.identity_confidence),
    identitySource: String(row.identity_source) as Participant["identitySource"],
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

function mapAgenda(row: Row): Agenda {
  return {
    id: String(row.id), meetingId: String(row.meeting_id),
    parentAgendaId: row.parent_agenda_id == null ? null : String(row.parent_agenda_id), title: String(row.title),
    summary: String(row.summary), sequence: numberValue(row.sequence), startMs: numberValue(row.start_ms),
    endMs: numberValue(row.end_ms), status: String(row.status) as Agenda["status"], source: String(row.source) as Agenda["source"],
    confidence: row.confidence == null ? null : numberValue(row.confidence), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

function mapRecording(row: Row): Recording {
  return {
    id: String(row.id), meetingId: String(row.meeting_id), originalFileName: String(row.original_file_name),
    mimeType: String(row.mime_type), sizeBytes: numberValue(row.size_bytes), durationMs: numberValue(row.duration_ms),
    storagePolicy: "LOCAL_ONLY", processingStatus: String(row.processing_status) as Recording["processingStatus"],
    createdAt: iso(row.created_at)
  };
}

function mapTranscriptSegment(row: Row): TranscriptSegment {
  return {
    id: String(row.id), organizationId: String(row.organization_id), meetingId: String(row.meeting_id),
    sequence: numberValue(row.sequence), speakerLabel: String(row.speaker_label), startMs: numberValue(row.start_ms),
    endMs: numberValue(row.end_ms), editedText: String(row.edited_text),
    source: String(row.source) as TranscriptSegment["source"], status: String(row.status) as TranscriptSegment["status"],
    editedBy: String(row.edited_by), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

function mapMinutes(row: Row): MeetingMinutes {
  return {
    id: String(row.id), organizationId: String(row.organization_id), meetingId: String(row.meeting_id),
    title: String(row.title), summary: String(row.summary), keyPoints: jsonArray<string>(row.key_points),
    discussionTopics: jsonArray<string>(row.discussion_topics), decisions: jsonArray<string>(row.decisions),
    actionItems: jsonArray<MeetingMinutes["actionItems"][number]>(row.action_items), risks: jsonArray<string>(row.risks),
    openQuestions: jsonArray<string>(row.open_questions), source: "TRANSCRIPT_TEXT", status: "CONFIRMED",
    version: numberValue(row.version), createdBy: String(row.created_by), updatedBy: String(row.updated_by),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

async function requireActiveMembership(client: Pool | PoolClient, userId: string, organizationId: string): Promise<Membership> {
  const result = await client.query(
    `SELECT * FROM memberships
     WHERE user_id = $1 AND organization_id = $2 AND status = 'ACTIVE'`,
    [userId, organizationId]
  );
  if (!result.rows[0]) throw new Error("MEMBERSHIP_INACTIVE");
  return mapMembership(result.rows[0] as Row);
}

async function loadSession(client: Pool | PoolClient, userId: string, organizationId: string): Promise<Session | null> {
  const result = await client.query(
    `SELECT u.*, o.id AS org_id, o.name AS org_name, o.slug AS org_slug,
            o.timezone AS org_timezone, o.retention_days, o.created_at AS org_created_at,
            o.updated_at AS org_updated_at, m.id AS membership_id, m.role, m.status,
            m.created_at AS membership_created_at
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'ACTIVE'`,
    [userId, organizationId]
  );
  const row = result.rows[0] as Row | undefined;
  if (!row) return null;
  return {
    user: mapUser(row),
    organization: mapOrganization({
      id: row.org_id, name: row.org_name, slug: row.org_slug, timezone: row.org_timezone,
      retention_days: row.retention_days, created_at: row.org_created_at, updated_at: row.org_updated_at
    }),
    membership: mapMembership({
      id: row.membership_id, organization_id: organizationId, user_id: userId, role: row.role,
      status: row.status, created_at: row.membership_created_at
    })
  };
}

export async function authenticateUser(email: string, password: string): Promise<Session | null> {
  const result = await getDatabasePool().query(
    `SELECT u.id, u.password_hash, m.organization_id
     FROM users u JOIN memberships m ON m.user_id = u.id
     WHERE lower(u.email) = lower($1) AND m.status = 'ACTIVE'
     ORDER BY m.created_at LIMIT 1`,
    [email.trim()]
  );
  const row = result.rows[0] as Row | undefined;
  if (!row || !(await verifyPassword(String(row.password_hash), password))) return null;
  return loadSession(getDatabasePool(), String(row.id), String(row.organization_id));
}

export async function getSession(userId: string, organizationId: string): Promise<Session | null> {
  return loadSession(getDatabasePool(), userId, organizationId);
}

export async function registerOrganization(input: RegisterOrganizationInput): Promise<Session> {
  const parsed = registerOrganizationInputSchema.parse(input);
  const passwordHash = await hashPassword(parsed.password);
  try {
    return await withTransaction(async (client) => {
      const now = new Date().toISOString();
      const userId = `user-${randomUUID()}`;
      const organizationId = `org-${randomUUID()}`;
      const membershipId = `membership-${randomUUID()}`;
      const user = await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, locale, timezone, created_at, updated_at)
         VALUES ($1, lower($2), $3, $4, 'ko', $5, $6, $6) RETURNING *`,
        [userId, parsed.email, passwordHash, parsed.displayName, parsed.timezone, now]
      );
      const organization = await client.query(
        `INSERT INTO organizations (id, name, slug, timezone, retention_days, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 365, $5, $5) RETURNING *`,
        [organizationId, parsed.organizationName, parsed.organizationSlug, parsed.timezone, now]
      );
      const membership = await client.query(
        `INSERT INTO memberships (id, organization_id, user_id, role, status, created_at)
         VALUES ($1, $2, $3, 'ORG_ADMIN', 'ACTIVE', $4) RETURNING *`,
        [membershipId, organizationId, userId, now]
      );
      return {
        user: mapUser(user.rows[0] as Row), organization: mapOrganization(organization.rows[0] as Row),
        membership: mapMembership(membership.rows[0] as Row)
      };
    });
  } catch (error) {
    const constraint = (error as { constraint?: string }).constraint;
    if (constraint === "users_email_key" || constraint === "users_email_lower_unique_idx") throw new Error("EMAIL_ALREADY_EXISTS");
    if (constraint === "organizations_slug_key") throw new Error("ORGANIZATION_SLUG_ALREADY_EXISTS");
    throw error;
  }
}

export async function getWorkspace(userId: string, organizationId: string): Promise<Workspace | null> {
  const pool = getDatabasePool();
  const session = await loadSession(pool, userId, organizationId);
  if (!session) return null;
  const [projectRows, meetingRows] = await Promise.all([
    pool.query(`SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at, id`, [organizationId]),
    pool.query(
      `SELECT m.*, p.name AS project_name,
              (SELECT count(*) FROM participants pa WHERE pa.meeting_id = m.id)::int AS participant_count,
              (SELECT count(*) FROM agendas a WHERE a.meeting_id = m.id)::int AS agenda_count,
              (SELECT count(*) FROM transcript_segments ts JOIN transcripts t ON t.id = ts.transcript_id
               WHERE t.meeting_id = m.id AND ts.status <> 'DELETED')::int AS transcript_segment_count,
              r.id AS recording_id, r.original_file_name, r.mime_type, r.size_bytes, r.duration_ms,
              r.storage_policy, r.processing_status, r.created_at AS recording_created_at,
              mm.id AS minutes_id, mm.title AS minutes_title, mm.summary AS minutes_summary,
              mm.key_points, mm.discussion_topics, mm.decisions, mm.action_items, mm.risks, mm.open_questions,
              mm.source AS minutes_source, mm.status AS minutes_status, mm.created_by AS minutes_created_by,
              mm.version AS minutes_version, mm.updated_by AS minutes_updated_by,
              mm.created_at AS minutes_created_at, mm.updated_at AS minutes_updated_at
       FROM meetings m JOIN projects p ON p.id = m.project_id AND p.organization_id = m.organization_id
       LEFT JOIN LATERAL (SELECT * FROM recordings WHERE meeting_id = m.id ORDER BY created_at DESC LIMIT 1) r ON true
       LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id AND mm.organization_id = m.organization_id
       WHERE m.organization_id = $1 AND m.status <> 'ARCHIVED'
       ORDER BY m.started_at, m.id`,
      [organizationId]
    )
  ]);
  const projects = projectRows.rows.map((row) => mapProject(row as Row));
  const meetings = meetingRows.rows.map((raw): MeetingSummary => {
    const row = raw as Row;
    const recording = row.recording_id == null ? null : mapRecording({
      id: row.recording_id, meeting_id: row.id, original_file_name: row.original_file_name, mime_type: row.mime_type,
      size_bytes: row.size_bytes, duration_ms: row.duration_ms, storage_policy: row.storage_policy,
      processing_status: row.processing_status, created_at: row.recording_created_at
    });
    const minutes = row.minutes_id == null ? null : mapMinutes({
      id: row.minutes_id, organization_id: row.organization_id, meeting_id: row.id, title: row.minutes_title,
      summary: row.minutes_summary, key_points: row.key_points, discussion_topics: row.discussion_topics,
      decisions: row.decisions, action_items: row.action_items, risks: row.risks, open_questions: row.open_questions,
      source: row.minutes_source, status: row.minutes_status, created_by: row.minutes_created_by,
      version: row.minutes_version, updated_by: row.minutes_updated_by,
      created_at: row.minutes_created_at, updated_at: row.minutes_updated_at
    });
    return {
      meeting: mapMeeting(row), projectName: String(row.project_name),
      participantCount: numberValue(row.participant_count), agendaCount: numberValue(row.agenda_count),
      recording, transcriptSegmentCount: numberValue(row.transcript_segment_count), minutes
    };
  });
  return {
    ...session, projects: projects.filter((project) => project.status === "ACTIVE"),
    archivedProjects: projects.filter((project) => project.status === "ARCHIVED"), meetings
  };
}

interface MeetingCursor {
  startedAt: string;
  id: string;
}

function encodeMeetingCursor(cursor: MeetingCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeMeetingCursor(value: string | undefined): MeetingCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<MeetingCursor>;
    if (typeof parsed.id !== "string" || typeof parsed.startedAt !== "string" || Number.isNaN(Date.parse(parsed.startedAt))) {
      throw new Error("INVALID_CURSOR");
    }
    return { id: parsed.id, startedAt: new Date(parsed.startedAt).toISOString() };
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

export async function listMeetings(
  userId: string,
  organizationId: string,
  options: MeetingListOptions = {}
): Promise<MeetingListPage> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  const cursor = decodeMeetingCursor(options.cursor);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const q = options.q?.trim() ?? "";
  if (q.length > 100) throw new Error("INVALID_FILTER");
  const values: unknown[] = [organizationId];
  const conditions = ["m.organization_id = $1", "m.status <> 'ARCHIVED'"];
  const addValue = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const parameter = addValue(pattern);
    conditions.push(`(
      m.title ILIKE ${parameter} ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM participants search_participant
                 WHERE search_participant.meeting_id = m.id AND search_participant.display_name ILIKE ${parameter} ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM transcripts search_transcript
                 JOIN transcript_segments search_segment ON search_segment.transcript_id = search_transcript.id
                 WHERE search_transcript.organization_id = m.organization_id AND search_transcript.meeting_id = m.id
                   AND search_transcript.status = 'CONFIRMED' AND search_segment.status <> 'DELETED'
                   AND search_segment.edited_text ILIKE ${parameter} ESCAPE '\\')
      OR (mm.id IS NOT NULL AND concat_ws(' ', mm.title, mm.summary, mm.key_points::text,
          mm.discussion_topics::text, mm.decisions::text, mm.action_items::text,
          mm.risks::text, mm.open_questions::text) ILIKE ${parameter} ESCAPE '\\')
    )`);
  }
  if (options.projectId) conditions.push(`m.project_id = ${addValue(options.projectId)}`);
  if (options.status) conditions.push(`m.status = ${addValue(options.status)}`);
  if (options.meetingType) conditions.push(`m.meeting_type = ${addValue(options.meetingType)}`);
  if (options.transcriptStatus === "CONFIRMED") conditions.push("t.id IS NOT NULL");
  if (options.transcriptStatus === "PENDING") conditions.push("t.id IS NULL");
  if (options.minutesStatus === "CONFIRMED") conditions.push("mm.id IS NOT NULL");
  if (options.minutesStatus === "PENDING") conditions.push("mm.id IS NULL");
  if (options.createdBy) conditions.push(`m.created_by = ${addValue(options.createdBy)}`);
  if (options.from) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || Number.isNaN(Date.parse(`${options.from}T00:00:00Z`))) {
      throw new Error("INVALID_FILTER");
    }
    conditions.push(`m.started_at >= ${addValue(`${options.from}T00:00:00+09:00`)}::timestamptz`);
  }
  if (options.to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.to) || Number.isNaN(Date.parse(`${options.to}T00:00:00Z`))) {
      throw new Error("INVALID_FILTER");
    }
    conditions.push(`m.started_at < (${addValue(`${options.to}T00:00:00+09:00`)}::timestamptz + interval '1 day')`);
  }
  if (options.from && options.to && options.from > options.to) throw new Error("INVALID_FILTER");

  const fromSql = `
     FROM meetings m
     JOIN projects p ON p.id = m.project_id AND p.organization_id = m.organization_id
     JOIN users creator ON creator.id = m.created_by
     LEFT JOIN transcripts t ON t.meeting_id = m.id AND t.organization_id = m.organization_id AND t.status = 'CONFIRMED'
     LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id AND mm.organization_id = m.organization_id AND mm.status = 'CONFIRMED'`;
  const baseWhere = conditions.join(" AND ");
  const countResult = await pool.query(`SELECT count(*)::int AS total_count ${fromSql} WHERE ${baseWhere}`, values);

  const pageConditions = [...conditions];
  if (cursor) {
    const startedAtParameter = addValue(cursor.startedAt);
    const idParameter = addValue(cursor.id);
    pageConditions.push(`(m.started_at, m.id) < (${startedAtParameter}::timestamptz, ${idParameter}::text)`);
  }
  const limitParameter = addValue(limit + 1);
  const result = await pool.query(
    `SELECT m.id, m.title, m.started_at, m.status, p.name AS project_name,
            COALESCE((SELECT jsonb_agg(pa.display_name ORDER BY pa.created_at, pa.id)
                      FROM participants pa WHERE pa.meeting_id = m.id), '[]'::jsonb) AS participant_names,
            t.id IS NOT NULL AS transcript_confirmed, t.version AS transcript_version,
            mm.id IS NOT NULL AS minutes_confirmed, mm.version AS minutes_version,
            COALESCE(editor.display_name, creator.display_name, '알 수 없음') AS updated_by_name,
            GREATEST(m.updated_at, t.updated_at, mm.updated_at) AS final_updated_at
     ${fromSql}
     LEFT JOIN users editor ON editor.id = COALESCE(mm.updated_by, t.confirmed_by)
     WHERE ${pageConditions.join(" AND ")}
     ORDER BY m.started_at DESC, m.id DESC
     LIMIT ${limitParameter}`,
    values
  );
  const hasNext = result.rows.length > limit;
  const rows = result.rows.slice(0, limit) as Row[];
  const items = rows.map((row): MeetingListItem => ({
    id: String(row.id), title: String(row.title), projectName: String(row.project_name),
    startedAt: iso(row.started_at), status: String(row.status) as Meeting["status"],
    participantNames: jsonArray<string>(row.participant_names),
    transcriptConfirmed: Boolean(row.transcript_confirmed),
    transcriptVersion: row.transcript_version == null ? null : numberValue(row.transcript_version),
    minutesConfirmed: Boolean(row.minutes_confirmed),
    minutesVersion: row.minutes_version == null ? null : numberValue(row.minutes_version),
    updatedByName: String(row.updated_by_name), updatedAt: iso(row.final_updated_at)
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasNext && last ? encodeMeetingCursor({ id: last.id, startedAt: last.startedAt }) : null,
    totalCount: numberValue((countResult.rows[0] as Row).total_count)
  };
}

export async function getMeetingFilterOptions(
  userId: string,
  organizationId: string
): Promise<MeetingFilterOptions> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  const [projects, creators] = await Promise.all([
    pool.query(
      `SELECT id, name FROM projects WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY name, id`,
      [organizationId]
    ),
    pool.query(
      `SELECT DISTINCT users.id, users.display_name
       FROM meetings JOIN users ON users.id = meetings.created_by
       WHERE meetings.organization_id = $1 AND meetings.status <> 'ARCHIVED'
       ORDER BY users.display_name, users.id`,
      [organizationId]
    )
  ]);
  return {
    projects: projects.rows.map((raw) => ({ id: String((raw as Row).id), name: String((raw as Row).name) })),
    creators: creators.rows.map((raw) => ({ id: String((raw as Row).id), displayName: String((raw as Row).display_name) }))
  };
}

export async function getMeetingDetail(
  userId: string,
  organizationId: string,
  meetingId: string
): Promise<MeetingDetailRecord> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  const meetingResult = await pool.query(
    `SELECT m.*, p.name AS project_name
     FROM meetings m JOIN projects p ON p.id = m.project_id AND p.organization_id = m.organization_id
     WHERE m.id = $1 AND m.organization_id = $2 AND m.status <> 'ARCHIVED'`,
    [meetingId, organizationId]
  );
  const meetingRow = meetingResult.rows[0] as Row | undefined;
  if (!meetingRow) throw new Error("MEETING_NOT_FOUND");

  const [participantsResult, agendasResult, transcript, minutes, revisionsResult] = await Promise.all([
    pool.query(`SELECT * FROM participants WHERE meeting_id = $1 ORDER BY created_at, id`, [meetingId]),
    pool.query(`SELECT * FROM agendas WHERE meeting_id = $1 ORDER BY sequence, id`, [meetingId]),
    getTranscript(userId, organizationId, meetingId).catch((error: unknown) => {
      if (error instanceof Error && error.message === "TRANSCRIPT_NOT_FOUND") return null;
      throw error;
    }),
    getMinutes(userId, organizationId, meetingId).catch((error: unknown) => {
      if (error instanceof Error && error.message === "MINUTES_NOT_FOUND") return null;
      throw error;
    }),
    pool.query(
      `SELECT revision.id, 'TRANSCRIPT' AS content_type, revision.version, revision.changed_by,
              users.display_name AS changed_by_name, revision.created_at
       FROM transcript_revisions revision
       JOIN transcripts transcript ON transcript.id = revision.transcript_id
       JOIN users ON users.id = revision.changed_by
       WHERE transcript.organization_id = $1 AND transcript.meeting_id = $2
       UNION ALL
       SELECT revision.id, 'MINUTES' AS content_type, revision.version, revision.changed_by,
              users.display_name AS changed_by_name, revision.created_at
       FROM meeting_minutes_revisions revision
       JOIN meeting_minutes minutes ON minutes.id = revision.meeting_minutes_id
       JOIN users ON users.id = revision.changed_by
       WHERE minutes.organization_id = $1 AND minutes.meeting_id = $2
       ORDER BY created_at DESC, version DESC`,
      [organizationId, meetingId]
    )
  ]);

  return {
    meeting: mapMeeting(meetingRow),
    projectName: String(meetingRow.project_name),
    participants: participantsResult.rows.map((row) => mapParticipant(row as Row)),
    agendas: agendasResult.rows.map((row) => mapAgenda(row as Row)),
    transcript,
    minutes,
    revisions: revisionsResult.rows.map((raw): MeetingRevisionSummary => {
      const row = raw as Row;
      return {
        id: String(row.id), contentType: String(row.content_type) as MeetingRevisionSummary["contentType"],
        version: numberValue(row.version), changedBy: String(row.changed_by), changedByName: String(row.changed_by_name),
        createdAt: iso(row.created_at)
      };
    })
  };
}

async function projectMutation(
  userId: string, organizationId: string, projectId: string, sql: string, values: unknown[]
): Promise<Project> {
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, organizationId);
    assertProjectManagerRole(membership.role);
    const result = await client.query(sql, values);
    if (!result.rows[0]) throw new Error("PROJECT_NOT_FOUND");
    return mapProject(result.rows[0] as Row);
  });
}

export async function createProject(userId: string, input: CreateProjectInput): Promise<Project> {
  const parsed = createProjectInputSchema.parse(input);
  try {
    return await withTransaction(async (client) => {
      const membership = await requireActiveMembership(client, userId, parsed.organizationId);
      assertProjectManagerRole(membership.role);
      const now = new Date().toISOString();
      const result = await client.query(
        `INSERT INTO projects (id, organization_id, name, key, description, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $7) RETURNING *`,
        [`project-${randomUUID()}`, parsed.organizationId, parsed.name, parsed.key, parsed.description, userId, now]
      );
      return mapProject(result.rows[0] as Row);
    });
  } catch (error) {
    if ((error as { constraint?: string }).constraint === "projects_organization_id_key_key") throw new Error("PROJECT_KEY_ALREADY_EXISTS");
    throw error;
  }
}

export async function updateProject(userId: string, input: UpdateProjectInput): Promise<Project> {
  const parsed = updateProjectInputSchema.parse(input);
  return projectMutation(userId, parsed.organizationId, parsed.projectId,
    `UPDATE projects SET name = $3, description = $4, updated_at = now()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [parsed.projectId, parsed.organizationId, parsed.name, parsed.description]);
}

export async function archiveProject(userId: string, input: ArchiveProjectInput): Promise<Project> {
  const parsed = archiveProjectInputSchema.parse(input);
  return projectMutation(userId, parsed.organizationId, parsed.projectId,
    `UPDATE projects SET status = 'ARCHIVED', updated_at = now()
     WHERE id = $1 AND organization_id = $2 RETURNING *`, [parsed.projectId, parsed.organizationId]);
}

export async function restoreProject(userId: string, input: RestoreProjectInput): Promise<Project> {
  const parsed = restoreProjectInputSchema.parse(input);
  return projectMutation(userId, parsed.organizationId, parsed.projectId,
    `UPDATE projects SET status = 'ACTIVE', updated_at = now()
     WHERE id = $1 AND organization_id = $2 RETURNING *`, [parsed.projectId, parsed.organizationId]);
}

export async function getProjectForOrganization(organizationId: string, projectId: string): Promise<Project | null> {
  const result = await getDatabasePool().query(
    `SELECT * FROM projects WHERE id = $1 AND organization_id = $2`, [projectId, organizationId]
  );
  return result.rows[0] ? mapProject(result.rows[0] as Row) : null;
}

export async function createMeeting(userId: string, input: CreateMeetingInput): Promise<MeetingBundle> {
  const parsed = createMeetingInputSchema.parse(input);
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, parsed.organizationId);
    assertMeetingEditorRole(membership.role);
    const project = await client.query(
      `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE'`,
      [parsed.projectId, parsed.organizationId]
    );
    if (!project.rows[0]) throw new Error("PROJECT_NOT_FOUND");
    const now = new Date().toISOString();
    const meetingId = `meeting-${randomUUID()}`;
    const meetingResult = await client.query(
      `INSERT INTO meetings (id, organization_id, project_id, title, title_status, meeting_type, status,
        started_at, ended_at, timezone, source_type, recording_consent_at, recording_consent_by,
        recording_consent_version, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'CONFIRMED', $5, 'REVIEW', $6, NULL, 'Asia/Seoul', 'BROWSER_RECORDING',
        $6, $7, $8, $7, $6, $6)
       RETURNING *`, [meetingId, parsed.organizationId, parsed.projectId, parsed.title, parsed.meetingType, now, userId, privacyPolicyVersion]
    );
    await client.query(
      `INSERT INTO privacy_audit_events (
         id, organization_id, meeting_id, actor_id, event_type, policy_version, metadata, created_at
       ) VALUES ($1, $2, $3, $4, 'RECORDING_CONSENT_RECORDED', $5, $6::jsonb, $7)`,
      [`privacy-audit-${randomUUID()}`, parsed.organizationId, meetingId, userId, privacyPolicyVersion,
        JSON.stringify({ source: "MEETING_CREATE", audioStorage: "BROWSER_ONLY" }), now]
    );
    const participants: Participant[] = [];
    for (const participant of parsed.participants) {
      const result = await client.query(
        `INSERT INTO participants (id, meeting_id, user_id, display_name, role_label, organization_label,
          identity_status, identity_source, created_at, updated_at)
         VALUES ($1, $2, NULL, $3, $4, $5, 'UNKNOWN', 'UNKNOWN', $6, $6) RETURNING *`,
        [`participant-${randomUUID()}`, meetingId, participant.displayName, participant.roleLabel, participant.organizationLabel, now]
      );
      participants.push(mapParticipant(result.rows[0] as Row));
    }
    const agendas: Agenda[] = [];
    for (const [sequence, agenda] of parsed.agendas.entries()) {
      const result = await client.query(
        `INSERT INTO agendas (id, meeting_id, title, summary, sequence, start_ms, end_ms, status, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 'PLANNED', 'PRESET', $6, $6) RETURNING *`,
        [`agenda-${randomUUID()}`, meetingId, agenda.title, agenda.summary, sequence, now]
      );
      agendas.push(mapAgenda(result.rows[0] as Row));
    }
    const recordingResult = await client.query(
      `INSERT INTO recordings (id, meeting_id, original_file_name, mime_type, size_bytes, duration_ms,
        processing_status, created_at, storage_policy)
       VALUES ($1, $2, $3, $4, $5, 0, 'REVIEW', $6, 'LOCAL_ONLY') RETURNING *`,
      [`recording-${randomUUID()}`, meetingId, parsed.fixtureFileName, parsed.fixtureMimeType, parsed.fixtureSizeBytes, now]
    );
    return {
      meeting: mapMeeting(meetingResult.rows[0] as Row), participants, agendas,
      recording: mapRecording(recordingResult.rows[0] as Row)
    };
  });
}

export async function ensureQuickCaptureMeeting(userId: string, organizationId: string): Promise<Meeting> {
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, organizationId);
    assertMeetingEditorRole(membership.role);
    const projectId = `${organizationId}-quick-recordings`;
    await client.query(
      `INSERT INTO projects (id, organization_id, name, key, description, status, created_by, created_at, updated_at)
       VALUES ($1, $2, '빠른 녹음', 'QUICK', '녹음 후 전사와 AI 분석 보고서를 바로 만드는 기본 보관함', 'ACTIVE', $3, now(), now())
       ON CONFLICT (organization_id, key) DO UPDATE SET status = 'ACTIVE', updated_at = now()`,
      [projectId, organizationId, userId]
    );
    const existing = await client.query(
      `SELECT * FROM meetings WHERE organization_id = $1 AND project_id = $2 AND status <> 'ARCHIVED'
       ORDER BY created_at DESC LIMIT 1`, [organizationId, projectId]
    );
    if (existing.rows[0]) return mapMeeting(existing.rows[0] as Row);
    const now = new Date().toISOString();
    const result = await client.query(
      `INSERT INTO meetings (id, organization_id, project_id, title, title_status, meeting_type, status,
        started_at, timezone, source_type, recording_consent_at, recording_consent_by,
        recording_consent_version, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, '빠른 녹음 회의록', 'CONFIRMED', 'GENERAL', 'REVIEW', $4, 'Asia/Seoul',
        'BROWSER_RECORDING', NULL, NULL, NULL, $5, $4, $4) RETURNING *`,
      [`meeting-${randomUUID()}`, organizationId, projectId, now, userId]
    );
    return mapMeeting(result.rows[0] as Row);
  });
}

function assertAuditIdempotencyKey(value: string): void {
  if (value.length < 8 || value.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new Error("IDEMPOTENCY_KEY_INVALID");
  }
}

export async function recordRecordingConsent(
  userId: string,
  input: { organizationId: string; meetingId: string; idempotencyKey: string; confirmedAt: string }
): Promise<Meeting> {
  assertAuditIdempotencyKey(input.idempotencyKey);
  const confirmedAt = new Date(input.confirmedAt);
  if (Number.isNaN(confirmedAt.getTime()) || confirmedAt.getTime() > Date.now() + 300_000
    || confirmedAt.getTime() < Date.now() - 30 * 86_400_000) throw new Error("CONSENT_TIMESTAMP_INVALID");
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, input.organizationId);
    assertMeetingEditorRole(membership.role);
    const result = await client.query(
      `UPDATE meetings
       SET recording_consent_at = coalesce(recording_consent_at, $5::timestamptz),
           recording_consent_by = coalesce(recording_consent_by, $3),
           recording_consent_version = coalesce(recording_consent_version, $4),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2 AND status <> 'ARCHIVED'
       RETURNING *`,
      [input.meetingId, input.organizationId, userId, privacyPolicyVersion, confirmedAt.toISOString()]
    );
    if (!result.rows[0]) throw new Error("MEETING_NOT_FOUND");
    await client.query(
      `INSERT INTO privacy_audit_events (
         id, organization_id, meeting_id, actor_id, event_type, policy_version, idempotency_key, metadata, created_at
       ) VALUES ($1, $2, $3, $4, 'RECORDING_CONSENT_RECORDED', $5, $6, $7::jsonb, $8::timestamptz)
       ON CONFLICT (organization_id, actor_id, event_type, idempotency_key)
       WHERE actor_id is not null and idempotency_key is not null DO NOTHING`,
      [`privacy-audit-${randomUUID()}`, input.organizationId, input.meetingId, userId,
        privacyPolicyVersion, input.idempotencyKey, JSON.stringify({ source: "RECORDING_START", audioStorage: "BROWSER_ONLY" }),
        confirmedAt.toISOString()]
    );
    return mapMeeting(result.rows[0] as Row);
  });
}

export async function recordExternalAiConsent(
  userId: string,
  input: { organizationId: string; meetingId: string; provider: "gemini"; idempotencyKey: string }
): Promise<{ provider: "gemini"; policyVersion: string; consentedAt: string }> {
  assertAuditIdempotencyKey(input.idempotencyKey);
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, input.organizationId);
    assertMinutesEditorRole(membership.role);
    const meeting = await client.query(
      `SELECT id FROM meetings WHERE id = $1 AND organization_id = $2 AND status <> 'ARCHIVED'`,
      [input.meetingId, input.organizationId]
    );
    if (!meeting.rows[0]) throw new Error("MEETING_NOT_FOUND");
    const consent = await client.query(
      `INSERT INTO external_ai_consents (
         id, organization_id, meeting_id, actor_id, provider, data_scope, policy_version, consented_at
       ) VALUES ($1, $2, $3, $4, 'gemini', 'CONFIRMED_TRANSCRIPT', $5, now())
       ON CONFLICT (organization_id, meeting_id, actor_id, provider, policy_version)
       DO UPDATE SET consented_at = external_ai_consents.consented_at
       RETURNING consented_at`,
      [`external-ai-consent-${randomUUID()}`, input.organizationId, input.meetingId, userId, privacyPolicyVersion]
    );
    await client.query(
      `INSERT INTO privacy_audit_events (
         id, organization_id, meeting_id, actor_id, event_type, policy_version, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, 'EXTERNAL_AI_CONSENT_RECORDED', $5, $6, $7::jsonb)
       ON CONFLICT (organization_id, actor_id, event_type, idempotency_key)
       WHERE actor_id is not null and idempotency_key is not null DO NOTHING`,
      [`privacy-audit-${randomUUID()}`, input.organizationId, input.meetingId, userId,
        privacyPolicyVersion, input.idempotencyKey,
        JSON.stringify({ provider: "gemini", dataScope: "CONFIRMED_TRANSCRIPT", originalAudio: false })]
    );
    return { provider: "gemini", policyVersion: privacyPolicyVersion, consentedAt: iso((consent.rows[0] as Row).consented_at) };
  });
}

export async function assertExternalAiConsent(
  userId: string,
  organizationId: string,
  meetingId: string,
  provider: "gemini"
): Promise<void> {
  const pool = getDatabasePool();
  const membership = await requireActiveMembership(pool, userId, organizationId);
  assertMinutesEditorRole(membership.role);
  const result = await pool.query(
    `SELECT 1 FROM external_ai_consents
     WHERE organization_id = $1 AND meeting_id = $2 AND actor_id = $3
       AND provider = $4 AND policy_version = $5`,
    [organizationId, meetingId, userId, provider, privacyPolicyVersion]
  );
  if (result.rowCount !== 1) throw new Error("EXTERNAL_AI_CONSENT_REQUIRED");
}

export async function requestMeetingDeletion(userId: string, input: MeetingDeletionInput): Promise<MeetingDeletionReceipt> {
  const parsed = meetingDeletionInputSchema.parse(input);
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, parsed.organizationId);
    assertMeetingDeletionRole(membership.role);
    const meeting = await client.query(
      `SELECT id, status FROM meetings WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [parsed.meetingId, parsed.organizationId]
    );
    if (!meeting.rows[0]) throw new Error("MEETING_NOT_FOUND");
    const existing = await client.query(
      `SELECT * FROM meeting_deletion_requests WHERE organization_id = $1 AND meeting_id = $2`,
      [parsed.organizationId, parsed.meetingId]
    );
    if (existing.rows[0]) {
      const row = existing.rows[0] as Row;
      return {
        requestId: String(row.id), organizationId: String(row.organization_id), meetingId: String(row.meeting_id),
        reason: String(row.reason) as MeetingDeletionReceipt["reason"], requestedAt: iso(row.requested_at), purgeAfter: iso(row.purge_after)
      };
    }
    if (String((meeting.rows[0] as Row).status) === "ARCHIVED") throw new Error("MEETING_NOT_FOUND");
    const requestedAt = new Date();
    const purgeAfter = new Date(requestedAt.getTime() + 30 * 86_400_000);
    const requestId = `meeting-deletion-${randomUUID()}`;
    await client.query(
      `INSERT INTO meeting_deletion_requests (
         id, organization_id, meeting_id, requested_by, reason, requested_at, purge_after
       ) VALUES ($1, $2, $3, $4, 'USER_REQUEST', $5, $6)`,
      [requestId, parsed.organizationId, parsed.meetingId, userId, requestedAt.toISOString(), purgeAfter.toISOString()]
    );
    await client.query(
      `UPDATE meetings SET status = 'ARCHIVED', updated_at = $3 WHERE id = $1 AND organization_id = $2`,
      [parsed.meetingId, parsed.organizationId, requestedAt.toISOString()]
    );
    await client.query(
      `INSERT INTO privacy_audit_events (
         id, organization_id, meeting_id, actor_id, event_type, policy_version, idempotency_key, metadata, created_at
       ) VALUES ($1, $2, $3, $4, 'MEETING_DELETION_REQUESTED', $5, $6, $7::jsonb, $8)
       ON CONFLICT (organization_id, actor_id, event_type, idempotency_key)
       WHERE actor_id is not null and idempotency_key is not null DO NOTHING`,
      [`privacy-audit-${randomUUID()}`, parsed.organizationId, parsed.meetingId, userId, privacyPolicyVersion,
        parsed.idempotencyKey, JSON.stringify({ reason: "USER_REQUEST", recoveryDays: 30 }), requestedAt.toISOString()]
    );
    return {
      requestId, organizationId: parsed.organizationId, meetingId: parsed.meetingId,
      reason: "USER_REQUEST", requestedAt: requestedAt.toISOString(), purgeAfter: purgeAfter.toISOString()
    };
  });
}

export async function runRetentionSweep(now = new Date(), batchSize = 100): Promise<RetentionSweepResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) throw new Error("RETENTION_BATCH_INVALID");
  const timestamp = now.toISOString();
  return withTransaction(async (client) => {
    const scheduled = await client.query(
      `WITH candidates AS (
         SELECT meetings.organization_id, meetings.id AS meeting_id
         FROM meetings
         JOIN organizations ON organizations.id = meetings.organization_id
         LEFT JOIN meeting_deletion_requests requests
           ON requests.organization_id = meetings.organization_id AND requests.meeting_id = meetings.id
         WHERE requests.id IS NULL
           AND coalesce(meetings.ended_at, meetings.created_at)
             + organizations.retention_days * interval '1 day' <= $1::timestamptz
         ORDER BY coalesce(meetings.ended_at, meetings.created_at), meetings.id
         FOR UPDATE OF meetings SKIP LOCKED
         LIMIT $2
       )
       INSERT INTO meeting_deletion_requests (
         id, organization_id, meeting_id, requested_by, reason, requested_at, purge_after
       )
       SELECT 'meeting-deletion-' || gen_random_uuid()::text, organization_id, meeting_id,
              NULL, 'RETENTION_EXPIRED', $1::timestamptz, $1::timestamptz
       FROM candidates
       ON CONFLICT (organization_id, meeting_id) DO NOTHING
       RETURNING organization_id, meeting_id`,
      [timestamp, batchSize]
    );
    for (const raw of scheduled.rows as Row[]) {
      await client.query(
        `INSERT INTO privacy_audit_events (
           id, organization_id, meeting_id, actor_id, event_type, policy_version, metadata, created_at
         ) VALUES ($1, $2, $3, NULL, 'RETENTION_DELETION_SCHEDULED', $4, $5::jsonb, $6)`,
        [`privacy-audit-${randomUUID()}`, String(raw.organization_id), String(raw.meeting_id), privacyPolicyVersion,
          JSON.stringify({ reason: "RETENTION_EXPIRED" }), timestamp]
      );
    }
    const due = await client.query(
      `SELECT organization_id, meeting_id, reason
       FROM meeting_deletion_requests
       WHERE purge_after <= $1::timestamptz
       ORDER BY purge_after, meeting_id
       FOR UPDATE SKIP LOCKED
       LIMIT $2`,
      [timestamp, batchSize]
    );
    const purgedMeetingIds: string[] = [];
    for (const raw of due.rows as Row[]) {
      const meetingId = String(raw.meeting_id);
      await client.query(
        `INSERT INTO privacy_audit_events (
           id, organization_id, meeting_id, actor_id, event_type, policy_version, metadata, created_at
         ) VALUES ($1, $2, $3, NULL, 'MEETING_PURGED', $4, $5::jsonb, $6)`,
        [`privacy-audit-${randomUUID()}`, String(raw.organization_id), meetingId, privacyPolicyVersion,
          JSON.stringify({ reason: String(raw.reason) }), timestamp]
      );
      const deleted = await client.query(`DELETE FROM meetings WHERE id = $1`, [meetingId]);
      if (deleted.rowCount === 1) purgedMeetingIds.push(meetingId);
    }
    return { scheduled: scheduled.rowCount ?? 0, purged: purgedMeetingIds.length, purgedMeetingIds };
  });
}

export class TranscriptVersionConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("TRANSCRIPT_VERSION_CONFLICT");
    this.name = "TranscriptVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

async function loadTranscriptDocument(
  client: Pool | PoolClient,
  organizationId: string,
  meetingId: string
): Promise<TranscriptDocument> {
  const header = await client.query(
    `SELECT transcripts.* FROM transcripts
     JOIN meetings ON meetings.id = transcripts.meeting_id AND meetings.organization_id = transcripts.organization_id
     WHERE transcripts.organization_id = $1 AND transcripts.meeting_id = $2
       AND transcripts.status = 'CONFIRMED' AND meetings.status <> 'ARCHIVED'`,
    [organizationId, meetingId]
  );
  const row = header.rows[0] as Row | undefined;
  if (!row) throw new Error("TRANSCRIPT_NOT_FOUND");
  const segments = await client.query(
    `SELECT s.*, t.organization_id, t.meeting_id
     FROM transcript_segments s JOIN transcripts t ON t.id = s.transcript_id
     WHERE s.transcript_id = $1 AND s.status <> 'DELETED'
     ORDER BY s.sequence`,
    [row.id]
  );
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    meetingId: String(row.meeting_id),
    status: "CONFIRMED",
    version: numberValue(row.version),
    confirmedBy: String(row.confirmed_by),
    confirmedAt: iso(row.confirmed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    segments: segments.rows.map((segment) => mapTranscriptSegment(segment as Row))
  };
}

export async function getTranscript(userId: string, organizationId: string, meetingId: string): Promise<TranscriptDocument> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  return loadTranscriptDocument(pool, organizationId, meetingId);
}

export async function getTranscriptForMinutesGeneration(
  userId: string,
  organizationId: string,
  meetingId: string
): Promise<TranscriptDocument> {
  const pool = getDatabasePool();
  const membership = await requireActiveMembership(pool, userId, organizationId);
  assertMinutesEditorRole(membership.role);
  return loadTranscriptDocument(pool, organizationId, meetingId);
}

export async function saveTranscript(
  userId: string,
  input: SaveTranscriptInput,
  options: ContentMutationOptions = {}
): Promise<TranscriptDocument> {
  const parsed = saveTranscriptInputSchema.parse(input);
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, parsed.organizationId);
    assertTranscriptEditorRole(membership.role);
    const meeting = await client.query(
      `SELECT id FROM meetings WHERE id = $1 AND organization_id = $2 AND status <> 'ARCHIVED'`,
      [parsed.meetingId, parsed.organizationId]
    );
    if (!meeting.rows[0]) throw new Error("MEETING_NOT_FOUND");
    return executeIdempotentMutation({
      client,
      organizationId: parsed.organizationId,
      meetingId: parsed.meetingId,
      actorId: userId,
      operation: "SAVE_TRANSCRIPT",
      idempotencyKey: options.idempotencyKey,
      request: parsed,
      parseCached: (value) => transcriptDocumentSchema.parse(value),
      mutate: async () => {
        const currentResult = await client.query(
      `SELECT * FROM transcripts WHERE organization_id = $1 AND meeting_id = $2 FOR UPDATE`,
      [parsed.organizationId, parsed.meetingId]
    );
    const current = currentResult.rows[0] as Row | undefined;
    let transcriptId: string;
    let nextVersion: number;

    if (!current) {
      if (parsed.version !== 0) throw new TranscriptVersionConflictError(0);
      transcriptId = `transcript-${randomUUID()}`;
      nextVersion = 1;
      await client.query(
        `INSERT INTO transcripts (id, organization_id, meeting_id, status, version, confirmed_by,
          confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'CONFIRMED', 1, $4, now(), now(), now())`,
        [transcriptId, parsed.organizationId, parsed.meetingId, userId]
      );
    } else {
      const currentVersion = numberValue(current.version);
      if (parsed.version !== currentVersion) throw new TranscriptVersionConflictError(currentVersion);
      transcriptId = String(current.id);
      const previous = await loadTranscriptDocument(client, parsed.organizationId, parsed.meetingId);
      await client.query(
        `INSERT INTO transcript_revisions (
           id, organization_id, meeting_id, transcript_id, version, snapshot, changed_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())`,
        [`transcript-revision-${randomUUID()}`, parsed.organizationId, parsed.meetingId,
          transcriptId, currentVersion, JSON.stringify({
          version: previous.version,
          confirmedBy: previous.confirmedBy,
          confirmedAt: previous.confirmedAt,
          segments: previous.segments
        }), userId]
      );
      nextVersion = currentVersion + 1;
      await client.query(
        `UPDATE transcripts SET version = $2, status = 'CONFIRMED', confirmed_by = $3,
          confirmed_at = now(), updated_at = now() WHERE id = $1`,
        [transcriptId, nextVersion, userId]
      );
      await client.query(`DELETE FROM transcript_segments WHERE transcript_id = $1`, [transcriptId]);
    }

    for (const segment of parsed.segments) {
      await client.query(
        `INSERT INTO transcript_segments (
           id, organization_id, meeting_id, transcript_id, sequence, speaker_label, start_ms, end_ms,
           edited_text, source, status, edited_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CONFIRMED', $11, now(), now())`,
        [`segment-${randomUUID()}`, parsed.organizationId, parsed.meetingId, transcriptId,
          segment.sequence, segment.speakerLabel, segment.startMs, segment.endMs,
          segment.editedText, segment.source, userId]
      );
    }
    const saved = await loadTranscriptDocument(client, parsed.organizationId, parsed.meetingId);
    if (saved.version !== nextVersion) throw new Error("TRANSCRIPT_SAVE_FAILED");
    return saved;
      }
    });
  });
}

export async function getTranscriptRevisions(
  userId: string,
  organizationId: string,
  meetingId: string
): Promise<TranscriptRevision[]> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  const activeTranscript = await loadTranscriptDocument(pool, organizationId, meetingId);
  const result = await pool.query(
    `SELECT * FROM transcript_revisions WHERE transcript_id = $1 ORDER BY version DESC`,
    [activeTranscript.id]
  );
  return result.rows.map((raw) => {
    const row = raw as Row;
    return {
      id: String(row.id), transcriptId: String(row.transcript_id), version: numberValue(row.version),
      snapshot: row.snapshot as Record<string, unknown>, changedBy: String(row.changed_by), createdAt: iso(row.created_at)
    };
  });
}

export function formatTranscriptText(transcript: TranscriptDocument): string {
  return transcript.segments.map((segment) => {
    const totalSeconds = Math.floor(segment.startMs / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `[${hours}:${minutes}:${seconds}] ${segment.speakerLabel}: ${segment.editedText}`;
  }).join("\n");
}

export async function saveTranscriptSegments(userId: string, input: SaveTranscriptSegmentsInput): Promise<TranscriptSegment[]> {
  const parsed = saveTranscriptSegmentsInputSchema.parse(input);
  let version = 0;
  try {
    version = (await getTranscript(userId, parsed.organizationId, parsed.meetingId)).version;
  } catch (error) {
    if (!(error instanceof Error && error.message === "TRANSCRIPT_NOT_FOUND")) throw error;
  }
  const saved = await saveTranscript(userId, {
    organizationId: parsed.organizationId,
    meetingId: parsed.meetingId,
    version,
    segments: parsed.segments.map((segment) => ({
      sequence: segment.sequence,
      speakerLabel: segment.speakerLabel,
      startMs: segment.startMs,
      endMs: segment.endMs,
      editedText: segment.editedText,
      source: segment.source
    }))
  });
  return saved.segments;
}

export async function getTranscriptSegments(userId: string, organizationId: string, meetingId: string): Promise<TranscriptSegment[]> {
  return (await getTranscript(userId, organizationId, meetingId)).segments;
}

export async function generateMinutesFromTranscript(
  userId: string,
  input: GenerateMinutesInput,
  generateMinutes: (segments: TranscriptSegment[]) => Promise<Pick<MeetingMinutes, "title" | "summary" | "keyPoints" | "discussionTopics" | "decisions" | "actionItems" | "risks" | "openQuestions">>
): Promise<MeetingMinutes> {
  const parsed = generateMinutesInputSchema.parse(input);
  const membership = await requireActiveMembership(getDatabasePool(), userId, parsed.organizationId);
  assertMinutesEditorRole(membership.role);
  let segments: TranscriptSegment[];
  try {
    segments = await getTranscriptSegments(userId, parsed.organizationId, parsed.meetingId);
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSCRIPT_NOT_FOUND") throw new Error("TRANSCRIPT_REQUIRED");
    throw error;
  }
  const generated = await generateMinutes(segments);
  const now = new Date().toISOString();
  return {
    id: `draft-${randomUUID()}`, organizationId: parsed.organizationId, meetingId: parsed.meetingId,
    ...generated, source: "TRANSCRIPT_TEXT", status: "DRAFT", version: 0,
    createdBy: userId, updatedBy: userId, createdAt: now, updatedAt: now
  };
}

export class MinutesVersionConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("MINUTES_VERSION_CONFLICT");
    this.name = "MinutesVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

async function loadMinutesDocument(
  client: Pool | PoolClient,
  organizationId: string,
  meetingId: string
): Promise<MeetingMinutes> {
  const result = await client.query(
    `SELECT meeting_minutes.* FROM meeting_minutes
     JOIN meetings ON meetings.id = meeting_minutes.meeting_id AND meetings.organization_id = meeting_minutes.organization_id
     WHERE meeting_minutes.organization_id = $1 AND meeting_minutes.meeting_id = $2
       AND meeting_minutes.status = 'CONFIRMED' AND meetings.status <> 'ARCHIVED'`,
    [organizationId, meetingId]
  );
  if (!result.rows[0]) throw new Error("MINUTES_NOT_FOUND");
  return mapMinutes(result.rows[0] as Row);
}

export async function getMinutes(userId: string, organizationId: string, meetingId: string): Promise<MeetingMinutes> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  return loadMinutesDocument(pool, organizationId, meetingId);
}

export async function saveMinutes(
  userId: string,
  input: SaveMinutesInput,
  options: ContentMutationOptions = {}
): Promise<MeetingMinutes> {
  const parsed = saveMinutesInputSchema.parse(input);
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, parsed.organizationId);
    assertMinutesConfirmerRole(membership.role);
    const meeting = await client.query(
      `SELECT id FROM meetings WHERE id = $1 AND organization_id = $2 AND status <> 'ARCHIVED'`,
      [parsed.meetingId, parsed.organizationId]
    );
    if (!meeting.rows[0]) throw new Error("MEETING_NOT_FOUND");
    const transcript = await client.query(
      `SELECT id FROM transcripts WHERE organization_id = $1 AND meeting_id = $2 AND status = 'CONFIRMED'`,
      [parsed.organizationId, parsed.meetingId]
    );
    if (!transcript.rows[0]) throw new Error("TRANSCRIPT_REQUIRED");
    return executeIdempotentMutation({
      client,
      organizationId: parsed.organizationId,
      meetingId: parsed.meetingId,
      actorId: userId,
      operation: "SAVE_MINUTES",
      idempotencyKey: options.idempotencyKey,
      request: parsed,
      parseCached: (value) => meetingMinutesSchema.parse(value),
      mutate: async () => {
        const currentResult = await client.query(
      `SELECT * FROM meeting_minutes WHERE organization_id = $1 AND meeting_id = $2 FOR UPDATE`,
      [parsed.organizationId, parsed.meetingId]
    );
    const current = currentResult.rows[0] as Row | undefined;
    let minutesId: string;
    let nextVersion: number;

    if (!current) {
      if (parsed.version !== 0) throw new MinutesVersionConflictError(0);
      minutesId = `minutes-${randomUUID()}`;
      nextVersion = 1;
      await client.query(
        `INSERT INTO meeting_minutes (id, organization_id, meeting_id, title, summary, key_points, discussion_topics,
          decisions, action_items, risks, open_questions, source, status, created_by, created_at, updated_at, version, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
          'TRANSCRIPT_TEXT', 'CONFIRMED', $12, now(), now(), 1, $12)`,
        [minutesId, parsed.organizationId, parsed.meetingId, parsed.title, parsed.summary,
          JSON.stringify(parsed.keyPoints), JSON.stringify(parsed.discussionTopics), JSON.stringify(parsed.decisions),
          JSON.stringify(parsed.actionItems), JSON.stringify(parsed.risks), JSON.stringify(parsed.openQuestions), userId]
      );
    } else {
      const currentVersion = numberValue(current.version);
      if (parsed.version !== currentVersion) throw new MinutesVersionConflictError(currentVersion);
      minutesId = String(current.id);
      const previous = mapMinutes(current);
      await client.query(
        `INSERT INTO meeting_minutes_revisions (
           id, organization_id, meeting_id, meeting_minutes_id, version, snapshot, changed_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())`,
        [`minutes-revision-${randomUUID()}`, parsed.organizationId, parsed.meetingId,
          minutesId, currentVersion, JSON.stringify(previous), userId]
      );
      nextVersion = currentVersion + 1;
      await client.query(
        `UPDATE meeting_minutes SET title = $2, summary = $3, key_points = $4::jsonb,
          discussion_topics = $5::jsonb, decisions = $6::jsonb, action_items = $7::jsonb,
          risks = $8::jsonb, open_questions = $9::jsonb, status = 'CONFIRMED', version = $10,
          updated_by = $11, updated_at = now() WHERE id = $1`,
        [minutesId, parsed.title, parsed.summary, JSON.stringify(parsed.keyPoints),
          JSON.stringify(parsed.discussionTopics), JSON.stringify(parsed.decisions), JSON.stringify(parsed.actionItems),
          JSON.stringify(parsed.risks), JSON.stringify(parsed.openQuestions), nextVersion, userId]
      );
    }
    const saved = await loadMinutesDocument(client, parsed.organizationId, parsed.meetingId);
    if (saved.version !== nextVersion) throw new Error("MINUTES_SAVE_FAILED");
    return saved;
      }
    });
  });
}

export async function getMinutesRevisions(
  userId: string,
  organizationId: string,
  meetingId: string
): Promise<MinutesRevision[]> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  const activeMinutes = await loadMinutesDocument(pool, organizationId, meetingId);
  const result = await pool.query(
    `SELECT * FROM meeting_minutes_revisions WHERE meeting_minutes_id = $1 ORDER BY version DESC`,
    [activeMinutes.id]
  );
  return result.rows.map((raw) => {
    const row = raw as Row;
    return {
      id: String(row.id), meetingMinutesId: String(row.meeting_minutes_id), version: numberValue(row.version),
      snapshot: row.snapshot as Record<string, unknown>, changedBy: String(row.changed_by), createdAt: iso(row.created_at)
    };
  });
}

export async function confirmMinutes(
  userId: string,
  input: GenerateMinutesInput,
  draft: Pick<MeetingMinutes, "title" | "summary" | "keyPoints" | "discussionTopics" | "decisions" | "actionItems" | "risks" | "openQuestions">
): Promise<MeetingMinutes> {
  const parsed = generateMinutesInputSchema.parse(input);
  let version = 0;
  try {
    version = (await getMinutes(userId, parsed.organizationId, parsed.meetingId)).version;
  } catch (error) {
    if (!(error instanceof Error && error.message === "MINUTES_NOT_FOUND")) throw error;
  }
  return saveMinutes(userId, { ...parsed, ...draft, version });
}
