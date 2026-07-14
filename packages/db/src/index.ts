import { hashPassword, verifyPassword } from "@meetingloop/auth";
import {
  assertProjectManagerRole,
  assertSameOrganization,
  archiveProjectInputSchema,
  assertMeetingEditorRole,
  createProjectInputSchema,
  createMeetingInputSchema,
  generateMinutesInputSchema,
  registerOrganizationInputSchema,
  restoreProjectInputSchema,
  saveTranscriptSegmentsInputSchema,
  updateProjectInputSchema,
  type ArchiveProjectInput,
  type Agenda,
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
  type SaveTranscriptSegmentsInput,
  type TranscriptSegment,
  type UpdateProjectInput,
  type User
} from "@meetingloop/domain";

export type HealthStatus = "ok" | "degraded";

export interface DatabaseHealth {
  status: HealthStatus;
  databaseUrlConfigured: boolean;
  checkedAt: string;
}

export function getDatabaseHealth(env: NodeJS.ProcessEnv = process.env): DatabaseHealth {
  return {
    status: env.DATABASE_URL ? "ok" : "degraded",
    databaseUrlConfigured: Boolean(env.DATABASE_URL),
    checkedAt: new Date().toISOString()
  };
}

interface StoredUser extends User {
  passwordHash: string;
}

export interface DemoSession {
  user: User;
  organization: Organization;
  membership: Membership;
}

export interface DemoWorkspace extends DemoSession {
  projects: Project[];
  archivedProjects: Project[];
  meetings: DemoMeetingSummary[];
}

export interface DemoMeetingBundle {
  meeting: Meeting;
  participants: Participant[];
  agendas: Agenda[];
  recording: Recording;
}

export interface DemoMeetingSummary {
  meeting: Meeting;
  projectName: string;
  participantCount: number;
  agendaCount: number;
  recording: Recording | null;
  transcriptSegmentCount: number;
  minutes: MeetingMinutes | null;
}

interface DemoState {
  users: StoredUser[];
  organizations: Organization[];
  memberships: Membership[];
  projects: Project[];
  meetings: Meeting[];
  participants: Participant[];
  agendas: Agenda[];
  recordings: Recording[];
  transcriptSegments: TranscriptSegment[];
  minutes: MeetingMinutes[];
}

let demoStatePromise: Promise<DemoState> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function publicUser(user: StoredUser): User {
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  return safeUser;
}

function slugifyId(prefix: string, value: string, existingCount: number): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${prefix}-${safe || "item"}-${existingCount + 1}`;
}

async function createDemoState(): Promise<DemoState> {
  const createdAt = "2026-07-14T00:00:00.000Z";
  const adminHash = await hashPassword("ChangeMe123!");
  const editorHash = await hashPassword("ChangeMe123!");
  const viewerHash = await hashPassword("ChangeMe123!");

  return {
    users: [
      {
        id: "user-admin",
        email: "admin@example.com",
        passwordHash: adminHash,
        displayName: "관리자",
        locale: "ko",
        timezone: "Asia/Seoul",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: "user-editor",
        email: "editor@example.com",
        passwordHash: editorHash,
        displayName: "회의 편집자",
        locale: "ko",
        timezone: "Asia/Seoul",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: "user-viewer",
        email: "viewer@example.com",
        passwordHash: viewerHash,
        displayName: "조회 사용자",
        locale: "ko",
        timezone: "Asia/Seoul",
        createdAt,
        updatedAt: createdAt
      }
    ],
    organizations: [
      {
        id: "org-demo",
        name: "MeetingLoop Demo",
        slug: "meetingloop-demo",
        timezone: "Asia/Seoul",
        retentionDays: 365,
        createdAt,
        updatedAt: createdAt
      },
      {
        id: "org-external",
        name: "External Demo",
        slug: "external-demo",
        timezone: "Asia/Seoul",
        retentionDays: 180,
        createdAt,
        updatedAt: createdAt
      }
    ],
    memberships: [
      {
        id: "membership-admin",
        organizationId: "org-demo",
        userId: "user-admin",
        role: "ORG_ADMIN",
        status: "ACTIVE",
        createdAt
      },
      {
        id: "membership-editor",
        organizationId: "org-demo",
        userId: "user-editor",
        role: "EDITOR",
        status: "ACTIVE",
        createdAt
      },
      {
        id: "membership-viewer",
        organizationId: "org-demo",
        userId: "user-viewer",
        role: "VIEWER",
        status: "ACTIVE",
        createdAt
      }
    ],
    meetings: [],
    participants: [],
    agendas: [],
    recordings: [],
    transcriptSegments: [],
    minutes: [],
    projects: [
      {
        id: "project-membership",
        organizationId: "org-demo",
        name: "회원 시스템 개선",
        key: "MEMBER",
        description: "로그인, 조직 권한, 회의 승인 흐름을 관리합니다.",
        status: "ACTIVE",
        createdBy: "user-admin",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: "project-recording",
        organizationId: "org-demo",
        name: "녹음 업로드 안정화",
        key: "REC",
        description: "모바일 녹음과 청크 업로드 재시도를 검증합니다.",
        status: "ACTIVE",
        createdBy: "user-admin",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: "project-external",
        organizationId: "org-external",
        name: "외부 조직 비공개 프로젝트",
        key: "EXT",
        description: "조직 격리 테스트용 프로젝트입니다.",
        status: "ACTIVE",
        createdBy: "user-admin",
        createdAt,
        updatedAt: createdAt
      }
    ]
  };
}

async function getDemoState(): Promise<DemoState> {
  demoStatePromise ??= createDemoState();
  return demoStatePromise;
}

function getMembership(state: DemoState, userId: string, organizationId: string): Membership {
  const membership = state.memberships.find((item) => item.userId === userId && item.organizationId === organizationId && item.status === "ACTIVE");
  if (!membership) {
    throw new Error("MEMBERSHIP_NOT_FOUND");
  }
  return membership;
}

export async function authenticateDemoUser(email: string, password: string): Promise<DemoSession | null> {
  const state = await getDemoState();
  const user = state.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return null;
  }

  const membership = state.memberships.find((item) => item.userId === user.id && item.status === "ACTIVE");
  if (!membership) {
    return null;
  }

  const organization = state.organizations.find((item) => item.id === membership.organizationId);
  if (!organization) {
    return null;
  }

  return {
    user: publicUser(user),
    organization,
    membership
  };
}

export async function getDemoSession(userId: string, organizationId: string): Promise<DemoSession | null> {
  const state = await getDemoState();
  const user = state.users.find((item) => item.id === userId);
  const organization = state.organizations.find((item) => item.id === organizationId);
  if (!user || !organization) {
    return null;
  }

  return {
    user: publicUser(user),
    organization,
    membership: getMembership(state, user.id, organization.id)
  };
}

export async function getDemoWorkspace(userId: string, organizationId: string): Promise<DemoWorkspace | null> {
  const state = await getDemoState();
  const session = await getDemoSession(userId, organizationId);
  if (!session) {
    return null;
  }

  return {
    ...session,
    projects: state.projects.filter((project) => project.organizationId === organizationId && project.status === "ACTIVE"),
    archivedProjects: state.projects.filter((project) => project.organizationId === organizationId && project.status === "ARCHIVED"),
    meetings: state.meetings
      .filter((meeting) => meeting.organizationId === organizationId && meeting.status !== "ARCHIVED")
      .map((meeting) => {
        const project = state.projects.find((item) => item.id === meeting.projectId);
        return {
          meeting,
          projectName: project?.name ?? "알 수 없는 프로젝트",
          participantCount: state.participants.filter((participant) => participant.meetingId === meeting.id).length,
          agendaCount: state.agendas.filter((agenda) => agenda.meetingId === meeting.id).length,
          recording: state.recordings.find((recording) => recording.meetingId === meeting.id) ?? null,
          transcriptSegmentCount: state.transcriptSegments.filter((segment) => segment.meetingId === meeting.id && segment.status !== "DELETED").length,
          minutes: state.minutes.find((minutes) => minutes.meetingId === meeting.id) ?? null
        };
      })
  };
}

export async function createDemoProject(userId: string, role: Role, input: CreateProjectInput): Promise<Project> {
  const state = await getDemoState();
  const parsed = createProjectInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertProjectManagerRole(role);
  assertProjectManagerRole(membership.role);

  const duplicate = state.projects.some((project) => project.organizationId === parsed.organizationId && project.key === parsed.key);
  if (duplicate) {
    throw new Error("PROJECT_KEY_ALREADY_EXISTS");
  }

  const timestamp = nowIso();
  const project: Project = {
    id: `project-${parsed.key.toLowerCase()}-${state.projects.length + 1}`,
    organizationId: parsed.organizationId,
    name: parsed.name,
    key: parsed.key,
    description: parsed.description,
    status: "ACTIVE",
    createdBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  state.projects.push(project);
  return project;
}

export async function registerDemoOrganization(input: RegisterOrganizationInput): Promise<DemoSession> {
  const state = await getDemoState();
  const parsed = registerOrganizationInputSchema.parse(input);
  const emailExists = state.users.some((user) => user.email.toLowerCase() === parsed.email.toLowerCase());
  if (emailExists) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const slugExists = state.organizations.some((organization) => organization.slug === parsed.organizationSlug);
  if (slugExists) {
    throw new Error("ORGANIZATION_SLUG_ALREADY_EXISTS");
  }

  const timestamp = nowIso();
  const user: StoredUser = {
    id: slugifyId("user", parsed.email.split("@")[0] ?? "new", state.users.length),
    email: parsed.email.toLowerCase(),
    passwordHash: await hashPassword(parsed.password),
    displayName: parsed.displayName,
    locale: "ko",
    timezone: parsed.timezone,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const organization: Organization = {
    id: slugifyId("org", parsed.organizationSlug, state.organizations.length),
    name: parsed.organizationName,
    slug: parsed.organizationSlug,
    timezone: parsed.timezone,
    retentionDays: 365,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const membership: Membership = {
    id: slugifyId("membership", parsed.organizationSlug, state.memberships.length),
    organizationId: organization.id,
    userId: user.id,
    role: "ORG_ADMIN",
    status: "ACTIVE",
    createdAt: timestamp
  };

  state.users.push(user);
  state.organizations.push(organization);
  state.memberships.push(membership);

  return {
    user: publicUser(user),
    organization,
    membership
  };
}

export async function updateDemoProject(userId: string, role: Role, input: UpdateProjectInput): Promise<Project> {
  const state = await getDemoState();
  const parsed = updateProjectInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertProjectManagerRole(role);
  assertProjectManagerRole(membership.role);

  const project = state.projects.find((item) => item.id === parsed.projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  assertSameOrganization(parsed.organizationId, project.organizationId);

  project.name = parsed.name;
  project.description = parsed.description;
  project.updatedAt = nowIso();
  return project;
}

export async function archiveDemoProject(userId: string, role: Role, input: ArchiveProjectInput): Promise<Project> {
  const state = await getDemoState();
  const parsed = archiveProjectInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertProjectManagerRole(role);
  assertProjectManagerRole(membership.role);

  const project = state.projects.find((item) => item.id === parsed.projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  assertSameOrganization(parsed.organizationId, project.organizationId);

  project.status = "ARCHIVED";
  project.updatedAt = nowIso();
  return project;
}

export async function restoreDemoProject(userId: string, role: Role, input: RestoreProjectInput): Promise<Project> {
  const state = await getDemoState();
  const parsed = restoreProjectInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertProjectManagerRole(role);
  assertProjectManagerRole(membership.role);

  const project = state.projects.find((item) => item.id === parsed.projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  assertSameOrganization(parsed.organizationId, project.organizationId);

  project.status = "ACTIVE";
  project.updatedAt = nowIso();
  return project;
}

export async function getDemoProjectForOrganization(organizationId: string, projectId: string): Promise<Project | null> {
  const state = await getDemoState();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }

  assertSameOrganization(organizationId, project.organizationId);
  return project;
}

export async function createDemoMeeting(userId: string, role: Role, input: CreateMeetingInput): Promise<DemoMeetingBundle> {
  const state = await getDemoState();
  const parsed = createMeetingInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertMeetingEditorRole(role);
  assertMeetingEditorRole(membership.role);

  const project = state.projects.find((item) => item.id === parsed.projectId && item.status === "ACTIVE");
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  assertSameOrganization(parsed.organizationId, project.organizationId);

  const timestamp = nowIso();
  const meetingId = slugifyId("meeting", parsed.title, state.meetings.length);
  const meeting: Meeting = {
    id: meetingId,
    organizationId: parsed.organizationId,
    projectId: parsed.projectId,
    title: parsed.title,
    titleStatus: "CONFIRMED",
    meetingType: parsed.meetingType,
    status: "REVIEW",
    startedAt: timestamp,
    endedAt: null,
    timezone: "Asia/Seoul",
    sourceType: "FILE_UPLOAD",
    recordingConsentAt: timestamp,
    createdBy: userId,
    approvedBy: null,
    approvedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const participants = parsed.participants.map((participant, index): Participant => ({
    id: `${meetingId}-participant-${index + 1}`,
    meetingId,
    userId: null,
    displayName: participant.displayName,
    roleLabel: participant.roleLabel,
    organizationLabel: participant.organizationLabel,
    speakerClusterId: `speaker-${String.fromCharCode(97 + index)}`,
    identityStatus: "SUGGESTED",
    identityConfidence: 0.8,
    identitySource: "MANUAL",
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  const agendas = parsed.agendas.map((agenda, index): Agenda => ({
    id: `${meetingId}-agenda-${index + 1}`,
    meetingId,
    parentAgendaId: null,
    title: agenda.title,
    summary: agenda.summary,
    sequence: index,
    startMs: index * 60000,
    endMs: (index + 1) * 60000,
    status: "CONFIRMED",
    source: "PRESET",
    confidence: null,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  const recording: Recording = {
    id: `${meetingId}-recording-1`,
    meetingId,
    storageKey: `${parsed.organizationId}/meetings/${meetingId}/fixture/${parsed.fixtureFileName}`,
    originalFileName: parsed.fixtureFileName,
    mimeType: parsed.fixtureMimeType,
    sizeBytes: parsed.fixtureSizeBytes,
    durationMs: 24000,
    checksum: `fixture-${meetingId}`,
    uploadStatus: "COMPLETED",
    processingStatus: "REVIEW",
    createdAt: timestamp
  };

  state.meetings.push(meeting);
  state.participants.push(...participants);
  state.agendas.push(...agendas);
  state.recordings.push(recording);

  return {
    meeting,
    participants,
    agendas,
    recording
  };
}

export async function ensureDemoQuickCaptureMeeting(userId: string, role: Role, organizationId: string): Promise<Meeting> {
  const state = await getDemoState();
  const membership = getMembership(state, userId, organizationId);
  assertMeetingEditorRole(role);
  assertMeetingEditorRole(membership.role);

  const projectId = `${organizationId}-quick-recordings`;
  let project = state.projects.find((item) => item.id === projectId);
  const timestamp = nowIso();
  if (!project) {
    project = {
      id: projectId,
      organizationId,
      name: "빠른 녹음",
      key: "QUICK",
      description: "녹음 후 전사와 AI 분석 보고서를 바로 만드는 기본 보관함",
      status: "ACTIVE",
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.projects.push(project);
  } else if (project.status === "ARCHIVED") {
    project.status = "ACTIVE";
    project.updatedAt = timestamp;
  }

  const existing = state.meetings.find((item) => item.organizationId === organizationId && item.projectId === projectId && item.status !== "ARCHIVED");
  if (existing) {
    return existing;
  }

  const meetingId = `${organizationId}-quick-meeting`;
  const meeting: Meeting = {
    id: meetingId,
    organizationId,
    projectId,
    title: "빠른 녹음 회의록",
    titleStatus: "CONFIRMED",
    meetingType: "GENERAL",
    status: "REVIEW",
    startedAt: timestamp,
    endedAt: null,
    timezone: "Asia/Seoul",
    sourceType: "BROWSER_RECORDING",
    recordingConsentAt: timestamp,
    createdBy: userId,
    approvedBy: null,
    approvedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  state.meetings.push(meeting);
  return meeting;
}

export async function saveDemoTranscriptSegments(userId: string, role: Role, input: SaveTranscriptSegmentsInput): Promise<TranscriptSegment[]> {
  const state = await getDemoState();
  const parsed = saveTranscriptSegmentsInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertMeetingEditorRole(role);
  assertMeetingEditorRole(membership.role);

  const meeting = state.meetings.find((item) => item.id === parsed.meetingId && item.status !== "ARCHIVED");
  if (meeting) {
    assertSameOrganization(parsed.organizationId, meeting.organizationId);
  }

  const timestamp = nowIso();
  const existingByClientId = new Map(
    state.transcriptSegments
      .filter((segment) => segment.meetingId === parsed.meetingId)
      .map((segment) => [segment.id, segment])
  );
  const saved = parsed.segments.map((segment): TranscriptSegment => {
    const id = `${parsed.meetingId}-transcript-${segment.clientId}`;
    const existing = existingByClientId.get(id);
    const next: TranscriptSegment = {
      id,
      organizationId: parsed.organizationId,
      meetingId: parsed.meetingId,
      sequence: segment.sequence,
      speakerLabel: segment.speakerLabel,
      startMs: segment.startMs,
      endMs: segment.endMs,
      rawText: segment.rawText,
      editedText: segment.editedText,
      source: segment.source,
      status: segment.status,
      editedBy: userId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    if (existing) {
      Object.assign(existing, next);
      return existing;
    }

    state.transcriptSegments.push(next);
    return next;
  });

  return saved;
}

export async function getDemoTranscriptSegments(organizationId: string, meetingId: string): Promise<TranscriptSegment[]> {
  const state = await getDemoState();
  const meeting = state.meetings.find((item) => item.id === meetingId);
  if (!meeting) {
    throw new Error("MEETING_NOT_FOUND");
  }
  assertSameOrganization(organizationId, meeting.organizationId);
  return state.transcriptSegments
    .filter((segment) => segment.meetingId === meetingId && segment.status !== "DELETED")
    .sort((left, right) => left.sequence - right.sequence);
}

export async function generateDemoMinutesFromTranscript(
  userId: string,
  role: Role,
  input: GenerateMinutesInput,
  generateMinutes: (segments: TranscriptSegment[]) => Promise<Pick<MeetingMinutes, "title" | "summary" | "keyPoints" | "discussionTopics" | "decisions" | "actionItems" | "risks" | "openQuestions">>
): Promise<MeetingMinutes> {
  const state = await getDemoState();
  const parsed = generateMinutesInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertMeetingEditorRole(role);
  assertMeetingEditorRole(membership.role);

  const meeting = state.meetings.find((item) => item.id === parsed.meetingId && item.status !== "ARCHIVED");
  if (meeting) {
    assertSameOrganization(parsed.organizationId, meeting.organizationId);
  }

  const segments = state.transcriptSegments
    .filter((segment) => segment.organizationId === parsed.organizationId && segment.meetingId === parsed.meetingId && segment.status !== "DELETED")
    .sort((left, right) => left.sequence - right.sequence);
  if (segments.length === 0) {
    throw new Error("TRANSCRIPT_REQUIRED");
  }

  const generated = await generateMinutes(segments);
  const timestamp = nowIso();
  const existing = state.minutes.find((minutes) => minutes.meetingId === parsed.meetingId);
  const next: MeetingMinutes = {
    id: existing?.id ?? `${parsed.meetingId}-minutes-1`,
    organizationId: parsed.organizationId,
    meetingId: parsed.meetingId,
    title: generated.title,
    summary: generated.summary,
    keyPoints: generated.keyPoints,
    discussionTopics: generated.discussionTopics,
    decisions: generated.decisions,
    actionItems: generated.actionItems,
    risks: generated.risks,
    openQuestions: generated.openQuestions,
    source: "TRANSCRIPT_TEXT",
    status: "DRAFT",
    createdBy: userId,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  if (existing) {
    Object.assign(existing, next);
    return existing;
  }

  state.minutes.push(next);
  return next;
}

export async function confirmDemoMinutes(
  userId: string,
  role: Role,
  input: GenerateMinutesInput,
  draft: Pick<MeetingMinutes, "title" | "summary" | "keyPoints" | "discussionTopics" | "decisions" | "actionItems" | "risks" | "openQuestions">
): Promise<MeetingMinutes> {
  const state = await getDemoState();
  const parsed = generateMinutesInputSchema.parse(input);
  const membership = getMembership(state, userId, parsed.organizationId);
  assertMeetingEditorRole(role);
  assertMeetingEditorRole(membership.role);

  let meeting = state.meetings.find((item) => item.id === parsed.meetingId && item.status !== "ARCHIVED");
  if (!meeting) {
    const timestamp = nowIso();
    const projectId = `${parsed.organizationId}-quick-recordings`;
    let project = state.projects.find((item) => item.id === projectId);
    if (!project) {
      project = {
        id: projectId,
        organizationId: parsed.organizationId,
        name: "빠른 녹음",
        key: "QUICK",
        description: "녹음 후 전사와 AI 분석 보고서를 바로 만드는 기본 보관함",
        status: "ACTIVE",
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.projects.push(project);
    }
    meeting = {
      id: parsed.meetingId,
      organizationId: parsed.organizationId,
      projectId,
      title: "빠른 녹음 회의록",
      titleStatus: "CONFIRMED",
      meetingType: "GENERAL",
      status: "REVIEW",
      startedAt: timestamp,
      endedAt: null,
      timezone: "Asia/Seoul",
      sourceType: "BROWSER_RECORDING",
      recordingConsentAt: timestamp,
      createdBy: userId,
      approvedBy: null,
      approvedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.meetings.push(meeting);
  }
  assertSameOrganization(parsed.organizationId, meeting.organizationId);

  const timestamp = nowIso();
  const existing = state.minutes.find((minutes) => minutes.meetingId === parsed.meetingId);
  const next: MeetingMinutes = {
    id: existing?.id ?? `${parsed.meetingId}-minutes-1`,
    organizationId: parsed.organizationId,
    meetingId: parsed.meetingId,
    title: draft.title,
    summary: draft.summary,
    keyPoints: draft.keyPoints,
    discussionTopics: draft.discussionTopics,
    decisions: draft.decisions,
    actionItems: draft.actionItems,
    risks: draft.risks,
    openQuestions: draft.openQuestions,
    source: "TRANSCRIPT_TEXT",
    status: "CONFIRMED",
    createdBy: userId,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  if (existing) {
    Object.assign(existing, next);
    return existing;
  }

  state.minutes.push(next);
  return next;
}
