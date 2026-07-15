import argon2 from "argon2";
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

if (process.env.NODE_ENV === "production") {
  console.error("Development seed is disabled when NODE_ENV=production.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to seed the development database.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : false
});

async function run() {
  await client.connect();
  await client.query("BEGIN");
  try {
    const timestamp = new Date().toISOString();
    const passwordHash = await argon2.hash("ChangeMe123!", { type: argon2.argon2id });

    await client.query(
      `INSERT INTO organizations (id, name, slug, timezone, retention_days, created_at, updated_at)
       VALUES ('org-demo', 'MeetingLoop Demo', 'meetingloop-demo', 'Asia/Seoul', 365, $1, $1)
       ON CONFLICT (id) DO NOTHING`,
      [timestamp]
    );
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, locale, timezone, created_at, updated_at)
       VALUES ('user-admin', 'admin@example.com', $1, '관리자', 'ko', 'Asia/Seoul', $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [passwordHash, timestamp]
    );
    await client.query(
      `INSERT INTO memberships (id, organization_id, user_id, role, status, created_at)
       VALUES ('membership-admin', 'org-demo', 'user-admin', 'ORG_ADMIN', 'ACTIVE', $1)
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [timestamp]
    );
    await client.query(
      `INSERT INTO projects (id, organization_id, name, key, description, status, created_by, created_at, updated_at)
       VALUES ('project-demo', 'org-demo', '데모 프로젝트', 'DEMO', '개발 환경 확인용 프로젝트', 'ACTIVE', 'user-admin', $1, $1)
       ON CONFLICT (organization_id, key) DO NOTHING`,
      [timestamp]
    );

    await client.query("COMMIT");
    console.log("Development seed applied: admin@example.com / ChangeMe123!");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
