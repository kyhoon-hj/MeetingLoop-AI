import { Pool, type PoolConfig } from "pg";

const defaultPoolMax = 10;
const defaultConnectionTimeoutMs = 5_000;
const defaultIdleTimeoutMs = 30_000;

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function getDatabasePoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const sslEnabled = env.DATABASE_SSL === "true";
  return {
    connectionString: env.DATABASE_URL,
    max: positiveInteger(env.DB_POOL_MAX, defaultPoolMax, "DB_POOL_MAX"),
    connectionTimeoutMillis: positiveInteger(
      env.DB_CONNECTION_TIMEOUT_MS,
      defaultConnectionTimeoutMs,
      "DB_CONNECTION_TIMEOUT_MS"
    ),
    idleTimeoutMillis: positiveInteger(env.DB_IDLE_TIMEOUT_MS, defaultIdleTimeoutMs, "DB_IDLE_TIMEOUT_MS"),
    ssl: sslEnabled
      ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : false
  };
}

let sharedPool: Pool | null = null;

export function createDatabasePool(env: NodeJS.ProcessEnv = process.env): Pool {
  return new Pool(getDatabasePoolConfig(env));
}

export function getDatabasePool(): Pool {
  sharedPool ??= createDatabasePool();
  return sharedPool;
}

export async function closeDatabasePool(): Promise<void> {
  if (!sharedPool) {
    return;
  }

  const pool = sharedPool;
  sharedPool = null;
  await pool.end();
}
