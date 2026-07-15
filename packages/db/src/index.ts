import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@meetingloop/auth";
import type { Pool, PoolClient } from "pg";
import {
  assertMeetingEditorRole,
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
  saveTranscriptInputSchema,
  saveTranscriptSegmentsInputSchema,
  updateProjectInputSchema,
  type Agenda,
  type ArchiveProjectInput,
  type CreateMeetingInput,
  type CreateProjectInput,
  type GenerateMinutesInput,
  type Meeting,
  type MeetingMinutes,
  type Membership,
  type Organization,
  type Participant,
  type Project,
  type Recording,
  type RegisterOrganizationInput,
  type RestoreProjectInput,
  type Role,
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

export { closeDatabasePool, createDatabasePool, getDatabasePool, getDatabasePoolConfig } from "./pool";
export { withTransaction } from "./transaction";

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
    createdBy: String(row.created_by), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
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
        started_at, ended_at, timezone, source_type, recording_consent_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'CONFIRMED', $5, 'REVIEW', $6, NULL, 'Asia/Seoul', 'BROWSER_RECORDING', $6, $7, $6, $6)
       RETURNING *`, [meetingId, parsed.organizationId, parsed.projectId, parsed.title, parsed.meetingType, now, userId]
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
        started_at, timezone, source_type, recording_consent_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, '빠른 녹음 회의록', 'CONFIRMED', 'GENERAL', 'REVIEW', $4, 'Asia/Seoul',
        'BROWSER_RECORDING', $4, $5, $4, $4) RETURNING *`,
      [`meeting-${randomUUID()}`, organizationId, projectId, now, userId]
    );
    return mapMeeting(result.rows[0] as Row);
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
    `SELECT * FROM transcripts
     WHERE organization_id = $1 AND meeting_id = $2 AND status = 'CONFIRMED'`,
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

export async function saveTranscript(userId: string, input: SaveTranscriptInput): Promise<TranscriptDocument> {
  const parsed = saveTranscriptInputSchema.parse(input);
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, parsed.organizationId);
    assertTranscriptEditorRole(membership.role);
    const meeting = await client.query(
      `SELECT id FROM meetings WHERE id = $1 AND organization_id = $2 AND status <> 'ARCHIVED'`,
      [parsed.meetingId, parsed.organizationId]
    );
    if (!meeting.rows[0]) throw new Error("MEETING_NOT_FOUND");
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
        `INSERT INTO transcript_revisions (id, transcript_id, version, snapshot, changed_by, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, now())`,
        [`transcript-revision-${randomUUID()}`, transcriptId, currentVersion, JSON.stringify({
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
        `INSERT INTO transcript_segments (id, transcript_id, sequence, speaker_label, start_ms, end_ms,
          edited_text, source, status, edited_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED', $9, now(), now())`,
        [`segment-${randomUUID()}`, transcriptId, segment.sequence, segment.speakerLabel,
          segment.startMs, segment.endMs, segment.editedText, segment.source, userId]
      );
    }
    const saved = await loadTranscriptDocument(client, parsed.organizationId, parsed.meetingId);
    if (saved.version !== nextVersion) throw new Error("TRANSCRIPT_SAVE_FAILED");
    return saved;
  });
}

export async function getTranscriptRevisions(
  userId: string,
  organizationId: string,
  meetingId: string
): Promise<TranscriptRevision[]> {
  const pool = getDatabasePool();
  await requireActiveMembership(pool, userId, organizationId);
  const transcript = await pool.query(
    `SELECT id FROM transcripts WHERE organization_id = $1 AND meeting_id = $2 AND status = 'CONFIRMED'`,
    [organizationId, meetingId]
  );
  if (!transcript.rows[0]) throw new Error("TRANSCRIPT_NOT_FOUND");
  const result = await pool.query(
    `SELECT * FROM transcript_revisions WHERE transcript_id = $1 ORDER BY version DESC`,
    [(transcript.rows[0] as Row).id]
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
    ...generated, source: "TRANSCRIPT_TEXT", status: "DRAFT", createdBy: userId, createdAt: now, updatedAt: now
  };
}

export async function confirmMinutes(
  userId: string,
  input: GenerateMinutesInput,
  draft: Pick<MeetingMinutes, "title" | "summary" | "keyPoints" | "discussionTopics" | "decisions" | "actionItems" | "risks" | "openQuestions">
): Promise<MeetingMinutes> {
  const parsed = generateMinutesInputSchema.parse(input);
  return withTransaction(async (client) => {
    const membership = await requireActiveMembership(client, userId, parsed.organizationId);
    assertMinutesConfirmerRole(membership.role);
    const meeting = await client.query(
      `SELECT id FROM meetings WHERE id = $1 AND organization_id = $2 AND status <> 'ARCHIVED'`,
      [parsed.meetingId, parsed.organizationId]
    );
    if (!meeting.rows[0]) throw new Error("MEETING_NOT_FOUND");
    const result = await client.query(
      `INSERT INTO meeting_minutes (id, organization_id, meeting_id, title, summary, key_points, discussion_topics,
        decisions, action_items, risks, open_questions, source, status, created_by, created_at, updated_at, version, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
        'TRANSCRIPT_TEXT', 'CONFIRMED', $12, now(), now(), 1, $12)
       ON CONFLICT (meeting_id) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
        key_points = EXCLUDED.key_points, discussion_topics = EXCLUDED.discussion_topics, decisions = EXCLUDED.decisions,
        action_items = EXCLUDED.action_items, risks = EXCLUDED.risks, open_questions = EXCLUDED.open_questions,
        status = 'CONFIRMED', version = meeting_minutes.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`,
      [`minutes-${randomUUID()}`, parsed.organizationId, parsed.meetingId, draft.title, draft.summary,
        JSON.stringify(draft.keyPoints), JSON.stringify(draft.discussionTopics), JSON.stringify(draft.decisions),
        JSON.stringify(draft.actionItems), JSON.stringify(draft.risks), JSON.stringify(draft.openQuestions), userId]
    );
    return mapMinutes(result.rows[0] as Row);
  });
}
