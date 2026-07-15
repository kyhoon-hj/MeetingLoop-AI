import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabasePool,
  createDatabasePool,
  createMeeting,
  createProject,
  getMeetingFilterOptions,
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
let searchable: MeetingBundle;
let pending: MeetingBundle;
let projectId = "";

databaseSuite("stage 7 meeting search and filters", () => {
  beforeAll(async () => {
    owner = await registerOrganization({
      email: `stage7-owner-${suffix}@example.com`, password: "Stage7Password!", displayName: "검색 관리자",
      organizationName: "검색 검증 조직", organizationSlug: `stage7-owner-${suffix}`, timezone: "Asia/Seoul"
    });
    outsider = await registerOrganization({
      email: `stage7-other-${suffix}@example.com`, password: "Stage7Password!", displayName: "외부 검색자",
      organizationName: "외부 검색 조직", organizationSlug: `stage7-other-${suffix}`, timezone: "Asia/Seoul"
    });
    const project = await createProject(owner.user.id, {
      organizationId: owner.organization.id, name: "통합 검색 프로젝트", key: "SEARCH", description: "7단계 검증"
    });
    projectId = project.id;
    searchable = await createMeeting(owner.user.id, {
      organizationId: owner.organization.id, projectId, title: "오로라 출시 결정 회의", meetingType: "DECISION",
      participants: [{ displayName: "김검색", roleLabel: "기획", organizationLabel: "제품팀" }],
      agendas: [{ title: "출시 범위", summary: "오로라 기능 범위" }], consentConfirmed: true,
      fixtureFileName: "local-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 128
    });
    pending = await createMeeting(owner.user.id, {
      organizationId: owner.organization.id, projectId, title: "미확정 주간 회의", meetingType: "WEEKLY",
      participants: [{ displayName: "박대기", roleLabel: "개발", organizationLabel: "개발팀" }],
      agendas: [{ title: "주간 점검", summary: "진행 상황" }], consentConfirmed: true,
      fixtureFileName: "local-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 128
    });
    await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: searchable.meeting.id, version: 0,
      segments: [{ sequence: 0, speakerLabel: "김검색", startMs: 0, endMs: 3000, editedText: "제니스 배포 일정을 최종 확정합니다.", source: "MANUAL" }]
    });
    await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: searchable.meeting.id, version: 0,
      title: "오로라 최종 회의록", summary: "출시 범위를 결정했습니다.", keyPoints: ["베타 범위"],
      discussionTopics: ["고객 공지"], decisions: ["7월 출시"],
      actionItems: [{ id: "search-action", content: "릴리스 노트를 작성한다.", assignee: "김검색", dueDate: null, evidenceSegmentSequence: 0 }],
      risks: ["일정 지연"], openQuestions: ["지원 범위"]
    });
    await cleanupPool?.query(`UPDATE meetings SET started_at = CASE WHEN id = $1 THEN '2026-07-10T01:00:00Z'::timestamptz ELSE '2026-06-01T01:00:00Z'::timestamptz END WHERE id = ANY($2::text[])`,
      [searchable.meeting.id, [searchable.meeting.id, pending.meeting.id]]);
  });

  afterAll(async () => {
    if (cleanupPool && owner && outsider) {
      await cleanupPool.query(`DELETE FROM organizations WHERE id = ANY($1::text[])`, [[owner.organization.id, outsider.organization.id]]);
      await cleanupPool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[owner.user.id, outsider.user.id]]);
      await cleanupPool.end();
    }
    await closeDatabasePool();
  });

  it.each([
    ["회의 제목", "오로라 출시"], ["참석자", "김검색"], ["최종 전사", "제니스 배포"],
    ["회의록 요약", "출시 범위"], ["결정 사항", "7월 출시"], ["할 일", "릴리스 노트"]
  ])("finds meetings by %s", async (_label, q) => {
    const page = await listMeetings(owner.user.id, owner.organization.id, { q });
    expect(page.totalCount).toBe(1);
    expect(page.items[0]?.id).toBe(searchable.meeting.id);
  });

  it("combines project, type, confirmation, creator and date filters", async () => {
    const page = await listMeetings(owner.user.id, owner.organization.id, {
      projectId, meetingType: "DECISION", transcriptStatus: "CONFIRMED", minutesStatus: "CONFIRMED",
      createdBy: owner.user.id, from: "2026-07-01", to: "2026-07-31"
    });
    expect(page.items.map((item) => item.id)).toEqual([searchable.meeting.id]);
  });

  it("filters pending content and keeps cursor results stable", async () => {
    const pendingPage = await listMeetings(owner.user.id, owner.organization.id, { transcriptStatus: "PENDING", minutesStatus: "PENDING" });
    expect(pendingPage.items.map((item) => item.id)).toEqual([pending.meeting.id]);
    const first = await listMeetings(owner.user.id, owner.organization.id, { projectId, limit: 1 });
    const second = await listMeetings(owner.user.id, owner.organization.id, { projectId, limit: 1, cursor: first.nextCursor! });
    expect(first.totalCount).toBe(2);
    expect(second.totalCount).toBe(2);
    expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
  });

  it("returns filter options only for the active organization", async () => {
    const options = await getMeetingFilterOptions(owner.user.id, owner.organization.id);
    expect(options.projects).toContainEqual({ id: projectId, name: "통합 검색 프로젝트" });
    expect(options.creators).toEqual([{ id: owner.user.id, displayName: "검색 관리자" }]);
    const outside = await getMeetingFilterOptions(outsider.user.id, outsider.organization.id);
    expect(outside.creators).toEqual([]);
  });

  it("rejects invalid search length and date ranges", async () => {
    await expect(listMeetings(owner.user.id, owner.organization.id, { q: "가".repeat(101) })).rejects.toThrow("INVALID_FILTER");
    await expect(listMeetings(owner.user.id, owner.organization.id, { from: "2026-08-01", to: "2026-07-01" })).rejects.toThrow("INVALID_FILTER");
  });

  it("never returns another organization's search results", async () => {
    const page = await listMeetings(outsider.user.id, outsider.organization.id, { q: "오로라" });
    expect(page.totalCount).toBe(0);
    expect(page.items).toEqual([]);
  });
});
