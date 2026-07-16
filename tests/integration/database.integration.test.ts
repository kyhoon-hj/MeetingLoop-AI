import { afterAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "../../packages/db/src";

const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
const databaseSuite = describe.skipIf(!databaseUrlConfigured);
const pool = databaseUrlConfigured ? createDatabasePool() : null;

databaseSuite("PostgreSQL integration", () => {
  afterAll(async () => {
    await pool?.end();
  });

  it("connects to the meeting database with migrations applied", async () => {
    const database = await pool!.query<{ name: string }>("SELECT current_database() AS name");
    const migrations = await pool!.query<{ count: string }>("SELECT count(*) AS count FROM schema_migrations");
    const rawTranscriptColumns = await pool!.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript_segments'
         AND column_name = 'raw_text'`
    );
    const contentConstraints = await pool!.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(constraints.oid) AS definition
       FROM pg_constraint constraints
       JOIN pg_namespace namespaces ON namespaces.oid = constraints.connamespace
       WHERE namespaces.nspname = 'public'
         AND constraints.conname IN ('transcript_segments_status_check', 'meeting_minutes_status_check')
       ORDER BY conname`
    );

    expect(database.rows[0]?.name).toBe("meeting");
    expect(Number(migrations.rows[0]?.count)).toBeGreaterThan(0);
    expect(Number(rawTranscriptColumns.rows[0]?.count)).toBe(0);
    expect(contentConstraints.rows).toHaveLength(2);
    expect(contentConstraints.rows.every((row) => !row.definition.includes("DRAFT"))).toBe(true);
  });
});
