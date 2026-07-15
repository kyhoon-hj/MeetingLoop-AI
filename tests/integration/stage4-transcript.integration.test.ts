import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabasePool,
  createDatabasePool,
  createMeeting,
  createProject,
  formatTranscriptText,
  getTranscript,
  getTranscriptRevisions,
  registerOrganization,
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

databaseSuite("stage 4 versioned final transcript", () => {
  beforeAll(async () => {
    owner = await registerOrganization({
      email: `stage4-owner-${suffix}@example.com`, password: "Stage4Password!", displayName: "전사 관리자",
      organizationName: "전사 검증 조직", organizationSlug: `stage4-owner-${suffix}`, timezone: "Asia/Seoul"
    });
    outsider = await registerOrganization({
      email: `stage4-other-${suffix}@example.com`, password: "Stage4Password!", displayName: "외부 관리자",
      organizationName: "외부 검증 조직", organizationSlug: `stage4-other-${suffix}`, timezone: "Asia/Seoul"
    });
    const project = await createProject(owner.user.id, {
      organizationId: owner.organization.id, name: "전사 프로젝트", key: "TRANSCRIPT", description: "4단계 검증"
    });
    meeting = await createMeeting(owner.user.id, {
      organizationId: owner.organization.id, projectId: project.id, title: "최종 전사 검증 회의",
      meetingType: "GENERAL", participants: [{ displayName: "화자 A", roleLabel: "검증", organizationLabel: "QA" }],
      agendas: [{ title: "전사 저장", summary: "버전과 revision 검증" }], consentConfirmed: true,
      fixtureFileName: "local-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 512
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

  it("returns not found before confirmation and blocks another organization", async () => {
    await expect(getTranscript(owner.user.id, owner.organization.id, meeting.meeting.id)).rejects.toThrow("TRANSCRIPT_NOT_FOUND");
    await expect(getTranscript(outsider.user.id, outsider.organization.id, meeting.meeting.id)).rejects.toThrow("TRANSCRIPT_NOT_FOUND");
  });

  it("confirms and retrieves the first final transcript as version 1", async () => {
    const saved = await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id,
      meetingId: meeting.meeting.id,
      version: 0,
      segments: [{ sequence: 0, speakerLabel: "화자 A", startMs: 0, endMs: 5000, editedText: "최초 확정 전사", source: "MANUAL" }]
    });
    expect(saved.version).toBe(1);
    expect(saved.segments[0]?.editedText).toBe("최초 확정 전사");
    expect(saved.segments[0]).not.toHaveProperty("rawText");
    expect((await getTranscript(owner.user.id, owner.organization.id, meeting.meeting.id)).version).toBe(1);
  });

  it("stores the previous snapshot before updating to the next version", async () => {
    const updated = await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id,
      meetingId: meeting.meeting.id,
      version: 1,
      segments: [
        { sequence: 0, speakerLabel: "화자 A", startMs: 0, endMs: 5000, editedText: "수정된 최종 전사", source: "MANUAL" },
        { sequence: 1, speakerLabel: "화자 B", startMs: 5000, endMs: 9000, editedText: "추가된 문장", source: "MANUAL" }
      ]
    });
    const revisions = await getTranscriptRevisions(owner.user.id, owner.organization.id, meeting.meeting.id);
    expect(updated.version).toBe(2);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.version).toBe(1);
    expect(JSON.stringify(revisions[0]?.snapshot)).toContain("최초 확정 전사");
    expect(formatTranscriptText(updated)).toContain("[00:00:05] 화자 B: 추가된 문장");
  });

  it("rejects a stale version without overwriting the current transcript", async () => {
    await expect(saveTranscript(owner.user.id, {
      organizationId: owner.organization.id,
      meetingId: meeting.meeting.id,
      version: 1,
      segments: [{ sequence: 0, speakerLabel: "화자 A", startMs: 0, endMs: 1000, editedText: "덮어쓰면 안 되는 내용", source: "MANUAL" }]
    })).rejects.toMatchObject({
      message: "TRANSCRIPT_VERSION_CONFLICT",
      currentVersion: 2
    });
    const current = await getTranscript(owner.user.id, owner.organization.id, meeting.meeting.id);
    expect(current.version).toBe(2);
    expect(current.segments[0]?.editedText).toBe("수정된 최종 전사");
    expect(await getTranscriptRevisions(owner.user.id, owner.organization.id, meeting.meeting.id)).toHaveLength(1);
  });

  it("allows active viewers to read but rejects transcript modification", async () => {
    await cleanupPool!.query(`UPDATE memberships SET role = 'VIEWER' WHERE id = $1`, [owner.membership.id]);
    try {
      expect((await getTranscript(owner.user.id, owner.organization.id, meeting.meeting.id)).version).toBe(2);
      await expect(saveTranscript(owner.user.id, {
        organizationId: owner.organization.id,
        meetingId: meeting.meeting.id,
        version: 2,
        segments: [{ sequence: 0, speakerLabel: "화자 A", startMs: 0, endMs: 1000, editedText: "권한 없는 수정", source: "MANUAL" }]
      })).rejects.toThrow("TRANSCRIPT_EDIT_FORBIDDEN");
    } finally {
      await cleanupPool!.query(`UPDATE memberships SET role = 'ORG_ADMIN' WHERE id = $1`, [owner.membership.id]);
    }
  });
});
