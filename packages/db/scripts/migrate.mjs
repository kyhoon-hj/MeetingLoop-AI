import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(scriptDirectory, "../../../.env"));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const migrationsDirectory = process.env.MIGRATIONS_DIRECTORY?.trim()
  ? path.resolve(process.env.MIGRATIONS_DIRECTORY)
  : path.resolve(scriptDirectory, "../migrations");
const migrationLockId = 724_190_001;
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : false
});

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function run() {
  await client.connect();
  await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d+.*\.sql$/.test(filename))
      .sort((left, right) => left.localeCompare(right));

    for (const filename of filenames) {
      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      const currentChecksum = checksum(sql);
      const applied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE filename = $1",
        [filename]
      );

      if (applied.rowCount) {
        if (applied.rows[0].checksum !== currentChecksum) {
          throw new Error(`Applied migration was modified: ${filename}`);
        }
        console.log(`skip ${filename}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [filename, currentChecksum]
        );
        await client.query("COMMIT");
        console.log(`apply ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]).catch(() => undefined);
    await client.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
