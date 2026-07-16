import { afterAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "../../packages/db/src";

const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
const databaseSuite = describe.skipIf(!databaseUrlConfigured);
const pool = databaseUrlConfigured ? createDatabasePool() : null;

databaseSuite("stage 2 persistence schema", () => {
  afterAll(async () => {
    await pool?.end();
  });

  it("provides versioned transcript and minutes structures", async () => {
    const tables = await pool!.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('transcripts', 'transcript_revisions', 'meeting_minutes_revisions')
       ORDER BY table_name`
    );
    const transcriptColumns = await pool!.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'transcript_segments'
       ORDER BY column_name`
    );
    const minutesColumns = await pool!.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'meeting_minutes'
         AND column_name IN ('version', 'updated_by')
       ORDER BY column_name`
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "meeting_minutes_revisions",
      "transcript_revisions",
      "transcripts"
    ]);
    expect(transcriptColumns.rows.map((row) => row.column_name)).toContain("transcript_id");
    expect(transcriptColumns.rows.map((row) => row.column_name)).toContain("meeting_id");
    expect(transcriptColumns.rows.map((row) => row.column_name)).toContain("organization_id");
    expect(minutesColumns.rows.map((row) => row.column_name)).toEqual(["updated_by", "version"]);
  });

  it("provides consent audit and deletion scheduling structures", async () => {
    const tables = await pool!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('privacy_audit_events', 'external_ai_consents', 'meeting_deletion_requests')
       ORDER BY table_name`
    );
    const meetingColumns = await pool!.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'meetings'
         AND column_name IN ('recording_consent_by', 'recording_consent_version')
       ORDER BY column_name`
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "external_ai_consents", "meeting_deletion_requests", "privacy_audit_events"
    ]);
    expect(meetingColumns.rows.map((row) => row.column_name)).toEqual([
      "recording_consent_by", "recording_consent_version"
    ]);
  });

  it("uses local-only recording metadata", async () => {
    const columns = await pool!.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'recordings'`
    );
    const names = columns.rows.map((row) => row.column_name);

    expect(names).toContain("storage_policy");
    expect(names).not.toContain("storage_key");
    expect(names).not.toContain("checksum");
    expect(names).not.toContain("upload_status");
  });

  it("creates tenant, timeline, and Korean substring search indexes", async () => {
    const indexes = await pool!.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'`
    );
    const names = new Set(indexes.rows.map((row) => row.indexname));

    for (const expected of [
      "meetings_organization_started_at_idx",
      "meetings_organization_status_started_at_idx",
      "transcripts_organization_status_updated_at_idx",
      "meeting_minutes_organization_status_updated_at_idx",
      "meetings_title_trgm_idx",
      "participants_display_name_trgm_idx",
      "transcript_segments_edited_text_trgm_idx",
      "meeting_minutes_search_trgm_idx"
    ]) {
      expect(names.has(expected), `missing index ${expected}`).toBe(true);
    }

    const extension = await pool!.query<{ installed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS installed"
    );
    expect(extension.rows[0]?.installed).toBe(true);
  });

  it("defines explicit delete behavior for owned records", async () => {
    const rules = await pool!.query<{ constraint_name: string; delete_rule: string }>(
      `SELECT constraint_name, delete_rule
       FROM information_schema.referential_constraints
       WHERE constraint_schema = 'public'
         AND constraint_name IN (
           'memberships_organization_id_fkey',
           'meetings_organization_id_fkey',
           'participants_user_id_fkey',
           'transcript_segments_organization_transcript_id_fkey',
           'meeting_minutes_organization_meeting_id_fkey'
         )`
    );
    const byName = new Map(rules.rows.map((row) => [row.constraint_name, row.delete_rule]));

    expect(byName.get("memberships_organization_id_fkey")).toBe("CASCADE");
    expect(byName.get("meetings_organization_id_fkey")).toBe("CASCADE");
    expect(byName.get("participants_user_id_fkey")).toBe("SET NULL");
    expect(byName.get("transcript_segments_organization_transcript_id_fkey")).toBe("CASCADE");
    expect(byName.get("meeting_minutes_organization_meeting_id_fkey")).toBe("CASCADE");
  });

  it("rejects a meeting that combines organizations and projects from different tenants", async () => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO organizations (id, name, slug, timezone, retention_days, created_at, updated_at)
         VALUES ('stage2-other-org', '다른 조직', 'stage2-other-org', 'Asia/Seoul', 365, $1, $1)`,
        [now]
      );

      await expect(client.query(
        `INSERT INTO meetings (
           id, organization_id, project_id, title, title_status, meeting_type, status,
           started_at, timezone, source_type, created_by, created_at, updated_at
         ) VALUES (
           'stage2-cross-tenant-meeting', 'stage2-other-org', 'project-demo', '차단 대상',
           'CONFIRMED', 'GENERAL', 'REVIEW', $1, 'Asia/Seoul', 'IMPORT', 'user-admin', $1, $1
         )`,
        [now]
      )).rejects.toMatchObject({ code: "23503" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
