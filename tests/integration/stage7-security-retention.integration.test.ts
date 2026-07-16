import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertExternalAiConsent,
  closeDatabasePool,
  createDatabasePool,
  createMeeting,
  createProject,
  getMeetingDetail,
  recordExternalAiConsent,
  recordRecordingConsent,
  registerOrganization,
  requestMeetingDeletion,
  runRetentionSweep,
  saveMinutes,
  saveTranscript,
  type MeetingBundle,
  type Session
} from "../../packages/db/src";

const configured = Boolean(process.env.DATABASE_URL);
const databaseSuite = describe.skipIf(!configured);
const cleanupPool = configured ? createDatabasePool() : null;
const suffix = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
let owner: Session;
let outsider: Session;
let consentMeeting: MeetingBundle;
let deletionMeeting: MeetingBundle;
let retentionMeeting: MeetingBundle;

async function meeting(title: string): Promise<MeetingBundle> {
  const project = await createProject(owner.user.id, {
    organizationId: owner.organization.id, name: title, key: `S7${Math.random().toString(36).slice(2, 7).toUpperCase()}`, description: "stage 7"
  });
  return createMeeting(owner.user.id, {
    organizationId: owner.organization.id, projectId: project.id, title, meetingType: "GENERAL",
    participants: [{ displayName: "보안 검증자", roleLabel: "검증", organizationLabel: "QA" }],
    agendas: [{ title: "개인정보 검증", summary: "감사와 삭제" }], consentConfirmed: true,
    fixtureFileName: "browser-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 128
  });
}

databaseSuite("stage 7 privacy, authorization and retention", () => {
  beforeAll(async () => {
    owner = await registerOrganization({
      email: `stage7-owner-${suffix}@example.com`, password: "Stage7Password!", displayName: "7단계 관리자",
      organizationName: "7단계 보안 조직", organizationSlug: `stage7-owner-${suffix}`, timezone: "Asia/Seoul"
    });
    outsider = await registerOrganization({
      email: `stage7-other-${suffix}@example.com`, password: "Stage7Password!", displayName: "다른 조직 관리자",
      organizationName: "7단계 외부 조직", organizationSlug: `stage7-other-${suffix}`, timezone: "Asia/Seoul"
    });
    consentMeeting = await meeting("동의 감사 회의");
    deletionMeeting = await meeting("사용자 삭제 회의");
    retentionMeeting = await meeting("보존 만료 회의");
    await saveTranscript(owner.user.id, {
      organizationId: owner.organization.id, meetingId: deletionMeeting.meeting.id, version: 0,
      segments: [{ sequence: 0, speakerLabel: "검증자", startMs: 0, endMs: 1000, editedText: "삭제될 확정 전사", source: "MANUAL" }]
    });
    await saveMinutes(owner.user.id, {
      organizationId: owner.organization.id, meetingId: deletionMeeting.meeting.id, version: 0,
      title: "삭제될 회의록", summary: "삭제 검증", keyPoints: ["삭제"], discussionTopics: [], decisions: [],
      actionItems: [], risks: [], openQuestions: []
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

  it("stores recording consent time, actor and policy with idempotent audit", async () => {
    expect(consentMeeting.meeting.recordingConsentAt).not.toBeNull();
    expect(consentMeeting.meeting.recordingConsentBy).toBe(owner.user.id);
    expect(consentMeeting.meeting.recordingConsentVersion).toBe("2026-07-16");
    const input = {
      organizationId: owner.organization.id, meetingId: consentMeeting.meeting.id,
      idempotencyKey: `recording-consent-${suffix}`, confirmedAt: new Date().toISOString()
    };
    await recordRecordingConsent(owner.user.id, input);
    await recordRecordingConsent(owner.user.id, input);
    const audit = await cleanupPool!.query<{ count: string }>(
      `SELECT count(*) FROM privacy_audit_events
       WHERE organization_id = $1 AND meeting_id = $2 AND event_type = 'RECORDING_CONSENT_RECORDED'
         AND idempotency_key = $3`,
      [owner.organization.id, consentMeeting.meeting.id, input.idempotencyKey]
    );
    expect(Number(audit.rows[0]?.count)).toBe(1);
  });

  it("requires current editor authority and tenant scope for Gemini consent", async () => {
    const idempotencyKey = `external-ai-consent-${suffix}`;
    await expect(assertExternalAiConsent(owner.user.id, owner.organization.id, consentMeeting.meeting.id, "gemini"))
      .rejects.toThrow("EXTERNAL_AI_CONSENT_REQUIRED");
    await recordExternalAiConsent(owner.user.id, {
      organizationId: owner.organization.id, meetingId: consentMeeting.meeting.id, provider: "gemini", idempotencyKey
    });
    await expect(assertExternalAiConsent(owner.user.id, owner.organization.id, consentMeeting.meeting.id, "gemini"))
      .resolves.toBeUndefined();
    await expect(recordExternalAiConsent(outsider.user.id, {
      organizationId: outsider.organization.id, meetingId: consentMeeting.meeting.id, provider: "gemini",
      idempotencyKey: `cross-ai-consent-${suffix}`
    })).rejects.toThrow("MEETING_NOT_FOUND");
    await cleanupPool!.query(`UPDATE memberships SET role = 'VIEWER' WHERE id = $1`, [owner.membership.id]);
    try {
      await expect(recordExternalAiConsent(owner.user.id, {
        organizationId: owner.organization.id, meetingId: consentMeeting.meeting.id, provider: "gemini",
        idempotencyKey: `viewer-ai-consent-${suffix}`
      })).rejects.toThrow("MINUTES_EDIT_FORBIDDEN");
    } finally {
      await cleanupPool!.query(`UPDATE memberships SET role = 'ORG_ADMIN' WHERE id = $1`, [owner.membership.id]);
    }
  });

  it("hides an authorized whole-meeting deletion immediately and deduplicates replay", async () => {
    const input = {
      organizationId: owner.organization.id, meetingId: deletionMeeting.meeting.id,
      confirmation: deletionMeeting.meeting.id, idempotencyKey: `meeting-delete-${suffix}`
    };
    await cleanupPool!.query(`UPDATE memberships SET role = 'VIEWER' WHERE id = $1`, [owner.membership.id]);
    try {
      await expect(requestMeetingDeletion(owner.user.id, input)).rejects.toThrow("MEETING_DELETE_FORBIDDEN");
    } finally {
      await cleanupPool!.query(`UPDATE memberships SET role = 'ORG_ADMIN' WHERE id = $1`, [owner.membership.id]);
    }
    await expect(requestMeetingDeletion(outsider.user.id, { ...input, organizationId: outsider.organization.id }))
      .rejects.toThrow("MEETING_NOT_FOUND");
    const first = await requestMeetingDeletion(owner.user.id, input);
    const replay = await requestMeetingDeletion(owner.user.id, input);
    expect(replay).toEqual(first);
    expect(new Date(first.purgeAfter).getTime() - new Date(first.requestedAt).getTime()).toBe(30 * 86_400_000);
    await expect(getMeetingDetail(owner.user.id, owner.organization.id, deletionMeeting.meeting.id)).rejects.toThrow("MEETING_NOT_FOUND");
    const retainedDuringRecovery = await cleanupPool!.query<{ transcripts: string; minutes: string }>(
      `SELECT
         (SELECT count(*) FROM transcripts WHERE meeting_id = $1)::text AS transcripts,
         (SELECT count(*) FROM meeting_minutes WHERE meeting_id = $1)::text AS minutes`,
      [deletionMeeting.meeting.id]
    );
    expect(Number(retainedDuringRecovery.rows[0]?.transcripts)).toBe(1);
    expect(Number(retainedDuringRecovery.rows[0]?.minutes)).toBe(1);
  });

  it("purges due user deletions and retention-expired meetings with cascade and audit", async () => {
    const past = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const due = new Date(Date.now() - 1_000).toISOString();
    await cleanupPool!.query(`UPDATE organizations SET retention_days = 30 WHERE id = $1`, [owner.organization.id]);
    await cleanupPool!.query(
      `UPDATE meetings SET created_at = $2, started_at = $2 WHERE id = $1`,
      [retentionMeeting.meeting.id, past]
    );
    await cleanupPool!.query(
      `UPDATE meeting_deletion_requests SET requested_at = $2, purge_after = $3 WHERE meeting_id = $1`,
      [deletionMeeting.meeting.id, past, due]
    );
    const result = await runRetentionSweep(new Date(), 100);
    expect(result.scheduled).toBeGreaterThanOrEqual(1);
    expect(result.purgedMeetingIds).toEqual(expect.arrayContaining([deletionMeeting.meeting.id, retentionMeeting.meeting.id]));
    const remaining = await cleanupPool!.query<{ count: string }>(
      `SELECT count(*) FROM meetings WHERE id = ANY($1::text[])`,
      [[deletionMeeting.meeting.id, retentionMeeting.meeting.id]]
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
    const content = await cleanupPool!.query<{ count: string }>(
      `SELECT (SELECT count(*) FROM transcripts WHERE meeting_id = $1)
            + (SELECT count(*) FROM meeting_minutes WHERE meeting_id = $1) AS count`,
      [deletionMeeting.meeting.id]
    );
    expect(Number(content.rows[0]?.count)).toBe(0);
    const audits = await cleanupPool!.query<{ event_type: string }>(
      `SELECT event_type FROM privacy_audit_events
       WHERE organization_id = $1 AND meeting_id = ANY($2::text[])`,
      [owner.organization.id, [deletionMeeting.meeting.id, retentionMeeting.meeting.id]]
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual(expect.arrayContaining([
      "MEETING_DELETION_REQUESTED", "RETENTION_DELETION_SCHEDULED", "MEETING_PURGED"
    ]));
  });
});
