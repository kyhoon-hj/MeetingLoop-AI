import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabasePool,
  createDatabasePool,
  createMeeting,
  createProject,
  getMeetingDetail,
  listMeetings,
  registerOrganization,
  saveMinutes,
  saveTranscript,
  type MeetingBundle,
  type Session
} from "../../packages/db/src";

const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
const databaseSuite = describe.skipIf(!databaseUrlConfigured);
const cleanupPool = databaseUrlConfigured ? createDatabasePool() : null;
const suffix = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
let owner: Session;
let outsider: Session;
let meetings: MeetingBundle[];

const minutesContent = {
  title: "상세 조회 회의록", summary: "목록과 상세 화면 조회를 검증합니다.", keyPoints: ["상세 조회"],
  discussionTopics: ["cursor 페이지"], decisions: ["화면 테스트 작성"], actionItems: [], risks: [], openQuestions: []
};

databaseSuite("stage 6 meeting list and detail read models", () => {
  beforeAll(async () => {
    owner = await registerOrganization({
      email: `stage6-owner-${suffix}@example.com`, password: "Stage6Password!", displayName: "조회 관리자",
      organizationName: "조회 검증 조직", organizationSlug: `stage6-owner-${suffix}`, timezone: "Asia/Seoul"
    });
    outsider = await registerOrganization({
      email: `stage6-other-${suffix}@example.com`, password: "Stage6Password!", displayName: "외부 조회자",
      organizationName: "외부 조회 조직", organizationSlug: `stage6-other-${suffix}`, timezone: "Asia/Seoul"
    });
    const project = await createProject(owner.user.id, {
      organizationId: owner.organization.id, name: "목록 프로젝트", key: "READ", description: "6단계 검증"
    });
    meetings = [];
    for (let index = 1; index <= 3; index += 1) {
      meetings.push(await createMeeting(owner.user.id, {
        organizationId: owner.organization.id, projectId: project.id, title: `조회 회의 ${index}`,
        meetingType: "GENERAL", participants: [{ displayName: `참석자 ${index}`, roleLabel: "검증", organizationLabel: "QA" }],
        agendas: [{ title: `안건 ${index}`, summary: "목록과 상세 조회" }], consentConfirmed: true,
        fixtureFileName: "local-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 256
      }));
    }
    const target = meetings[0]!;
    await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 0,
      segments: [{ sequence: 0, speakerLabel: "참석자 1", startMs: 0, endMs: 3000, editedText: "상세 화면 전사", source: "MANUAL" }]
    });
    await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 1,
      segments: [{ sequence: 0, speakerLabel: "참석자 1", startMs: 0, endMs: 3000, editedText: "수정된 상세 화면 전사", source: "MANUAL" }]
    });
    await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 0, ...minutesContent
    });
    await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: target.meeting.id, version: 1,
      ...minutesContent, summary: "수정된 상세 조회 회의록입니다."
    });
  });

  afterAll(async () => {
    if (cleanupPool && owner && outsider) {
      await cleanupPool.query(`DELETE FROM organizations WHERE id = ANY($1::text[])`, [[owner.organization.id, outsider.organization.id]]);
      await cleanupPool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[owner.user.id, outsider.user.id]]);
      await cleanupPool.end();
    }
    await closeDatabasePool();
  });

  it("returns organization-scoped list fields and content states", async () => {
    const page = await listMeetings(owner.user.id, owner.organization.id, { limit: 10 });
    expect(page.items).toHaveLength(3);
    const target = page.items.find((item) => item.id === meetings[0]!.meeting.id);
    expect(target).toMatchObject({ projectName: "목록 프로젝트", participantNames: ["참석자 1"], transcriptConfirmed: true, minutesConfirmed: true });
    expect(target?.updatedByName).toBe("조회 관리자");
  });

  it("uses a stable cursor without returning duplicate meetings", async () => {
    const first = await listMeetings(owner.user.id, owner.organization.id, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await listMeetings(owner.user.id, owner.organization.id, { limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
    expect(second.nextCursor).toBeNull();
  });

  it("returns meeting, participants, agendas, final content and revision history", async () => {
    const detail = await getMeetingDetail(owner.user.id, owner.organization.id, meetings[0]!.meeting.id);
    expect(detail.participants[0]?.displayName).toBe("참석자 1");
    expect(detail.agendas[0]?.title).toBe("안건 1");
    expect(detail.transcript?.version).toBe(2);
    expect(detail.minutes?.version).toBe(2);
    expect(detail.revisions.map((item) => `${item.contentType}:${item.version}`).sort())
      .toEqual(["MINUTES:1", "TRANSCRIPT:1"]);
  });

  it("rejects invalid cursors with a controlled error", async () => {
    await expect(listMeetings(owner.user.id, owner.organization.id, { cursor: "not-a-cursor" }))
      .rejects.toThrow("INVALID_CURSOR");
  });

  it("does not expose another organization's meeting", async () => {
    await expect(getMeetingDetail(outsider.user.id, outsider.organization.id, meetings[0]!.meeting.id))
      .rejects.toThrow("MEETING_NOT_FOUND");
    const outsiderPage = await listMeetings(outsider.user.id, outsider.organization.id);
    expect(outsiderPage.items).toHaveLength(0);
  });
});
