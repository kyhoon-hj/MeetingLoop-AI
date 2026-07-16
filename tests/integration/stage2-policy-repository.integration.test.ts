import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabasePool,
  createDatabasePool,
  createMeeting,
  createProject,
  getMinutes,
  getTranscript,
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

const transcriptInput = () => ({
  organizationId: owner.organization.id,
  meetingId: meeting.meeting.id,
  version: 0,
  segments: [{
    sequence: 0, speakerLabel: "화자 A", startMs: 0, endMs: 1500,
    editedText: "확정 전사만 PostgreSQL에 저장합니다.", source: "MANUAL" as const
  }]
});

const minutesContent = {
  title: "정책 준수 회의록",
  summary: "확정된 전사를 기준으로 저장했습니다.",
  keyPoints: ["브라우저 초안은 저장하지 않음"],
  discussionTopics: ["서버 저장 범위"],
  decisions: ["확정 콘텐츠만 저장"],
  actionItems: [],
  risks: [],
  openQuestions: []
};

databaseSuite("stage 2 policy-compliant repositories", () => {
  beforeAll(async () => {
    owner = await registerOrganization({
      email: `stage2-policy-owner-${suffix}@example.com`, password: "Stage2Password!", displayName: "정책 관리자",
      organizationName: "정책 검증 조직", organizationSlug: `stage2-policy-owner-${suffix}`, timezone: "Asia/Seoul"
    });
    outsider = await registerOrganization({
      email: `stage2-policy-other-${suffix}@example.com`, password: "Stage2Password!", displayName: "외부 사용자",
      organizationName: "외부 정책 조직", organizationSlug: `stage2-policy-other-${suffix}`, timezone: "Asia/Seoul"
    });
    const project = await createProject(owner.user.id, {
      organizationId: owner.organization.id, name: "정책 프로젝트", key: "POLICY", description: "2단계 검증"
    });
    meeting = await createMeeting(owner.user.id, {
      organizationId: owner.organization.id, projectId: project.id, title: "정책 저장 검증",
      meetingType: "GENERAL", participants: [{ displayName: "화자 A", roleLabel: "검증", organizationLabel: "QA" }],
      agendas: [{ title: "저장 범위", summary: "확정 콘텐츠만 저장" }], consentConfirmed: true,
      fixtureFileName: "browser-only.wav", fixtureMimeType: "audio/wav", fixtureSizeBytes: 256
    });
  });

  afterAll(async () => {
    if (cleanupPool && owner && outsider) {
      await cleanupPool.query("DELETE FROM organizations WHERE id = ANY($1::text[])", [[owner.organization.id, outsider.organization.id]]);
      await cleanupPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[owner.user.id, outsider.user.id]]);
      await cleanupPool.end();
    }
    await closeDatabasePool();
  });

  it("does not create server tables for D3 browser-only derived data", async () => {
    const prohibited = [
      "audio_quality_reports", "audio_artifacts", "audio_normalization_runs", "voice_regions", "overlap_regions",
      "segment_speaker_assignments", "speaker_clusters", "speaker_assignment_events", "transcription_runs",
      "precise_analysis_candidates", "source_separation_results", "transcript_words", "transcription_selection_events",
      "project_dictionary_terms", "dictionary_application_events", "transcript_edit_events", "extracted_items",
      "evidence_links", "meeting_review_events"
    ];
    const result = await cleanupPool!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [prohibited]
    );
    expect(result.rows).toEqual([]);
  });

  it("deduplicates transcript mutations and rejects key reuse with another request", async () => {
    const first = await saveTranscript(owner.user.id, transcriptInput(), { idempotencyKey: `transcript-${suffix}` });
    const replay = await saveTranscript(owner.user.id, transcriptInput(), { idempotencyKey: `transcript-${suffix}` });
    expect(first.version).toBe(1);
    expect(replay).toEqual(first);

    await expect(saveTranscript(owner.user.id, {
      ...transcriptInput(),
      segments: [{ ...transcriptInput().segments[0]!, editedText: "같은 키로 다른 요청" }]
    }, { idempotencyKey: `transcript-${suffix}` })).rejects.toThrow("MUTATION_IDEMPOTENCY_CONFLICT");

    const receipts = await cleanupPool!.query<{ count: string }>(
      `SELECT count(*) FROM content_mutation_receipts
       WHERE organization_id = $1 AND meeting_id = $2 AND operation = 'SAVE_TRANSCRIPT'`,
      [owner.organization.id, meeting.meeting.id]
    );
    expect(Number(receipts.rows[0]?.count)).toBe(1);
  });

  it("deduplicates confirmed minutes without creating another version", async () => {
    const input = { organizationId: owner.organization.id, meetingId: meeting.meeting.id, version: 0, ...minutesContent };
    const first = await saveMinutes(owner.user.id, input, { idempotencyKey: `minutes-${suffix}` });
    const replay = await saveMinutes(owner.user.id, input, { idempotencyKey: `minutes-${suffix}` });
    expect(first.version).toBe(1);
    expect(replay).toEqual(first);
  });

  it("persists after a pool restart and remains invisible across organizations", async () => {
    await closeDatabasePool();
    expect((await getTranscript(owner.user.id, owner.organization.id, meeting.meeting.id)).version).toBe(1);
    expect((await getMinutes(owner.user.id, owner.organization.id, meeting.meeting.id)).version).toBe(1);
    await expect(getTranscript(outsider.user.id, outsider.organization.id, meeting.meeting.id))
      .rejects.toThrow("TRANSCRIPT_NOT_FOUND");
    await expect(getMinutes(outsider.user.id, outsider.organization.id, meeting.meeting.id))
      .rejects.toThrow("MINUTES_NOT_FOUND");
  });

  it("enforces composite tenant foreign keys on confirmed segments and receipts", async () => {
    const transcript = await cleanupPool!.query<{ id: string }>(
      "SELECT id FROM transcripts WHERE organization_id = $1 AND meeting_id = $2",
      [owner.organization.id, meeting.meeting.id]
    );
    await expect(cleanupPool!.query(
      `INSERT INTO transcript_segments (
         id, organization_id, meeting_id, transcript_id, sequence, speaker_label, start_ms, end_ms,
         edited_text, source, status, edited_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 99, '침입', 0, 1, '차단', 'MANUAL', 'CONFIRMED', $5, now(), now())`,
      [`cross-segment-${suffix}`, outsider.organization.id, meeting.meeting.id, transcript.rows[0]!.id, owner.user.id]
    )).rejects.toMatchObject({ code: "23503" });

    await expect(cleanupPool!.query(
      `INSERT INTO content_mutation_receipts (
         id, organization_id, meeting_id, actor_id, operation, idempotency_key, request_hash, status, response_json
       ) VALUES ($1, $2, $3, $4, 'SAVE_TRANSCRIPT', $5, $6, 'COMPLETED', '{}'::jsonb)`,
      [`cross-receipt-${suffix}`, outsider.organization.id, meeting.meeting.id, owner.user.id,
        `cross-${suffix}`, "a".repeat(64)]
    )).rejects.toMatchObject({ code: "23503" });
  });
});
