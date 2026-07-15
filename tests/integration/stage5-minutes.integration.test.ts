import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabasePool,
  createDatabasePool,
  createMeeting,
  createProject,
  generateMinutesFromTranscript,
  getMinutes,
  getMinutesRevisions,
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
let meeting: MeetingBundle;
let emptyMeeting: MeetingBundle;

const content = {
  title: "단계 5 회의록",
  summary: "확정 전사를 사용해 회의록 저장 정책을 검증했습니다.",
  keyPoints: ["DB의 확정 전사만 AI 입력으로 사용"],
  discussionTopics: ["회의록 버전 관리"],
  decisions: ["수정 전 revision을 저장"],
  actionItems: [{ id: "action-1", content: "실패 케이스를 검증한다.", assignee: null, dueDate: null, evidenceSegmentSequence: 0 }],
  risks: [],
  openQuestions: []
};

databaseSuite("stage 5 versioned final minutes", () => {
  beforeAll(async () => {
    owner = await registerOrganization({
      email: `stage5-owner-${suffix}@example.com`, password: "Stage5Password!", displayName: "회의록 관리자",
      organizationName: "회의록 검증 조직", organizationSlug: `stage5-owner-${suffix}`, timezone: "Asia/Seoul"
    });
    outsider = await registerOrganization({
      email: `stage5-other-${suffix}@example.com`, password: "Stage5Password!", displayName: "외부 관리자",
      organizationName: "외부 회의록 조직", organizationSlug: `stage5-other-${suffix}`, timezone: "Asia/Seoul"
    });
    const project = await createProject(owner.user.id, {
      organizationId: owner.organization.id, name: "회의록 프로젝트", key: "MINUTES", description: "5단계 검증"
    });
    const meetingInput = {
      organizationId: owner.organization.id, projectId: project.id, meetingType: "GENERAL" as const,
      participants: [{ displayName: "화자 A", roleLabel: "검증", organizationLabel: "QA" }],
      agendas: [{ title: "회의록 저장", summary: "버전과 revision 검증" }], consentConfirmed: true as const,
      fixtureFileName: "local-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 512
    };
    meeting = await createMeeting(owner.user.id, { ...meetingInput, title: "최종 회의록 검증 회의" });
    emptyMeeting = await createMeeting(owner.user.id, { ...meetingInput, title: "전사 없는 회의" });
    await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: meeting.meeting.id, version: 0,
      segments: [{ sequence: 0, speakerLabel: "화자 A", startMs: 0, endMs: 5000, editedText: "확정 전사만 사용합니다.", source: "MANUAL" }]
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

  it("requires a DB-confirmed transcript for generation and saving", async () => {
    await expect(generateMinutesFromTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: emptyMeeting.meeting.id
    }, async () => content)).rejects.toThrow("TRANSCRIPT_REQUIRED");
    await expect(saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: emptyMeeting.meeting.id, version: 0, ...content
    })).rejects.toThrow("TRANSCRIPT_REQUIRED");
  });

  it("generates from the confirmed transcript and saves version 1", async () => {
    const draft = await generateMinutesFromTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: meeting.meeting.id
    }, async (segments) => {
      expect(segments).toHaveLength(1);
      expect(segments[0]?.editedText).toBe("확정 전사만 사용합니다.");
      return content;
    });
    expect(draft.status).toBe("DRAFT");
    await expect(getMinutes(owner.user.id, owner.organization.id, meeting.meeting.id)).rejects.toThrow("MINUTES_NOT_FOUND");
    const saved = await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: meeting.meeting.id, version: 0, ...content
    });
    expect(saved.version).toBe(1);
    expect(saved.status).toBe("CONFIRMED");
  });

  it("stores the previous snapshot before updating to version 2", async () => {
    const updated = await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: meeting.meeting.id, version: 1,
      ...content, summary: "사용자가 수정하고 다시 확정한 회의록입니다."
    });
    const revisions = await getMinutesRevisions(owner.user.id, owner.organization.id, meeting.meeting.id);
    expect(updated.version).toBe(2);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.version).toBe(1);
    expect(JSON.stringify(revisions[0]?.snapshot)).toContain(content.summary);
  });

  it("rejects a stale save without changing the current minutes", async () => {
    await expect(saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: meeting.meeting.id, version: 1,
      ...content, summary: "덮어쓰면 안 되는 회의록"
    })).rejects.toMatchObject({ message: "MINUTES_VERSION_CONFLICT", currentVersion: 2 });
    expect((await getMinutes(owner.user.id, owner.organization.id, meeting.meeting.id)).summary)
      .toBe("사용자가 수정하고 다시 확정한 회의록입니다.");
    expect(await getMinutesRevisions(owner.user.id, owner.organization.id, meeting.meeting.id)).toHaveLength(1);
  });

  it("allows viewers to read but rejects minutes modification", async () => {
    await cleanupPool!.query(`UPDATE memberships SET role = 'VIEWER' WHERE id = $1`, [owner.membership.id]);
    try {
      expect((await getMinutes(owner.user.id, owner.organization.id, meeting.meeting.id)).version).toBe(2);
      await expect(saveMinutes(owner.user.id, {
        organizationId: owner.organization.id, meetingId: meeting.meeting.id, version: 2, ...content
      })).rejects.toThrow("MINUTES_CONFIRM_FORBIDDEN");
      await expect(getMinutes(outsider.user.id, outsider.organization.id, meeting.meeting.id)).rejects.toThrow("MINUTES_NOT_FOUND");
    } finally {
      await cleanupPool!.query(`UPDATE memberships SET role = 'ORG_ADMIN' WHERE id = $1`, [owner.membership.id]);
    }
  });
});
