import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "../../packages/db/src";

const executeFile = promisify(execFile);
const configured = Boolean(process.env.DATABASE_URL);
const databaseSuite = describe.skipIf(!configured);
const pool = configured ? createDatabasePool() : null;
const suffix = `${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
const schema = `migration_stage2_${suffix}`;
const emptySchema = `migration_empty_${suffix}`;
let fixtureDirectory = "";
const migrationsDirectory = path.resolve("packages/db/migrations");
const migrateScript = path.resolve("packages/db/scripts/migrate.mjs");

function schemaDatabaseUrl(targetSchema: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", `-csearch_path=${targetSchema},public`);
  return url.toString();
}

async function runMigrator(
  directory = fixtureDirectory,
  targetSchema = schema
): Promise<{ stdout: string; stderr: string }> {
  return executeFile(process.execPath, [migrateScript], {
    cwd: path.resolve("."),
    env: { ...process.env, DATABASE_URL: schemaDatabaseUrl(targetSchema), MIGRATIONS_DIRECTORY: directory }
  });
}

databaseSuite("stage 2 migration runner", () => {
  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), "meetingloop-migrations-"));
    await pool!.query(`CREATE SCHEMA ${schema}`);
    await pool!.query(`CREATE SCHEMA ${emptySchema}`);
    const filenames = (await readdir(migrationsDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const filename of filenames.filter((name) => name.startsWith("0001") || name.startsWith("0002") ||
      name.startsWith("0003") || name.startsWith("0004") || name.startsWith("0005"))) {
      await writeFile(path.join(fixtureDirectory, filename), await readFile(path.join(migrationsDirectory, filename)));
    }
  });

  afterAll(async () => {
    await pool?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool?.query(`DROP SCHEMA IF EXISTS ${emptySchema} CASCADE`);
    await pool?.end();
    if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
  });

  it("applies 0001-0007 to an empty database schema", async () => {
    await expect(runMigrator(migrationsDirectory, emptySchema)).resolves.toMatchObject({
      stdout: expect.stringContaining("apply 0007_privacy_retention_operations.sql")
    });
    const migrations = await pool!.query<{ count: string }>(
      `SELECT count(*) FROM ${emptySchema}.schema_migrations`
    );
    expect(Number(migrations.rows[0]?.count)).toBe(7);
  });

  it("migrates an existing 0001-0005 database forward through 0007", async () => {
    await expect(runMigrator()).resolves.toMatchObject({ stdout: expect.stringContaining("apply 0005_tenant_scope_constraints.sql") });
    await writeFile(
      path.join(fixtureDirectory, "0006_single_mic_processing_schema.sql"),
      await readFile(path.join(migrationsDirectory, "0006_single_mic_processing_schema.sql"))
    );
    await expect(runMigrator()).resolves.toMatchObject({ stdout: expect.stringContaining("apply 0006_single_mic_processing_schema.sql") });
    await writeFile(
      path.join(fixtureDirectory, "0007_privacy_retention_operations.sql"),
      await readFile(path.join(migrationsDirectory, "0007_privacy_retention_operations.sql"))
    );
    await expect(runMigrator()).resolves.toMatchObject({ stdout: expect.stringContaining("apply 0007_privacy_retention_operations.sql") });
    const table = await pool!.query<{ exists: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`, [`${schema}.content_mutation_receipts`]
    );
    expect(table.rows[0]?.exists).toBe(true);
  });

  it("detects a changed checksum for an applied migration", async () => {
    const target = path.join(fixtureDirectory, "0001_phase1_auth_project.sql");
    await writeFile(target, `${await readFile(target, "utf8")}\n-- checksum mutation fixture\n`);
    await expect(runMigrator()).rejects.toMatchObject({
      stderr: expect.stringContaining("Applied migration was modified: 0001_phase1_auth_project.sql")
    });
    await writeFile(target, await readFile(path.join(migrationsDirectory, "0001_phase1_auth_project.sql")));
  });

  it("rolls back both DDL and migration history after a partial failure", async () => {
    await writeFile(path.join(fixtureDirectory, "0007_partial_failure.sql"), [
      "create table migration_partial_marker (id integer primary key);",
      "select missing_stage2_function();"
    ].join("\n"));
    await expect(runMigrator()).rejects.toBeDefined();
    const marker = await pool!.query<{ exists: boolean }>(
      "SELECT to_regclass($1) IS NOT NULL AS exists", [`${schema}.migration_partial_marker`]
    );
    const history = await pool!.query<{ count: string }>(
      `SELECT count(*) FROM ${schema}.schema_migrations WHERE filename = '0007_partial_failure.sql'`
    );
    expect(marker.rows[0]?.exists).toBe(false);
    expect(Number(history.rows[0]?.count)).toBe(0);
  });
});
