import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "./pool";

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
  pool: Pool = getDatabasePool()
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original operation error when rollback also fails.
    }
    throw error;
  } finally {
    client.release();
  }
}
