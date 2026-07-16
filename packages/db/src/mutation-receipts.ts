import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type ContentMutationOperation = "SAVE_TRANSCRIPT" | "SAVE_MINUTES";

export interface ContentMutationOptions {
  idempotencyKey?: string | undefined;
}

export class MutationIdempotencyConflictError extends Error {
  constructor() {
    super("MUTATION_IDEMPOTENCY_CONFLICT");
    this.name = "MutationIdempotencyConflictError";
  }
}

export class MutationInProgressError extends Error {
  constructor() {
    super("MUTATION_IN_PROGRESS");
    this.name = "MutationInProgressError";
  }
}

interface IdempotentMutationInput<T> {
  client: PoolClient;
  organizationId: string;
  meetingId: string;
  actorId: string;
  operation: ContentMutationOperation;
  idempotencyKey?: string | undefined;
  request: unknown;
  parseCached: (value: unknown) => T;
  mutate: () => Promise<T>;
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(value)) throw new Error("IDEMPOTENCY_KEY_INVALID");
}

export async function executeIdempotentMutation<T>(input: IdempotentMutationInput<T>): Promise<T> {
  if (!input.idempotencyKey) return input.mutate();
  assertIdempotencyKey(input.idempotencyKey);
  const hash = requestHash(input.request);
  const inserted = await input.client.query(
    `INSERT INTO content_mutation_receipts (
       id, organization_id, meeting_id, actor_id, operation, idempotency_key,
       request_hash, status, response_json, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'IN_PROGRESS', NULL, now(), now())
     ON CONFLICT (organization_id, actor_id, operation, idempotency_key) DO NOTHING
     RETURNING id`,
    [`mutation-${randomUUID()}`, input.organizationId, input.meetingId, input.actorId,
      input.operation, input.idempotencyKey, hash]
  );

  if (!inserted.rows[0]) {
    const existing = await input.client.query(
      `SELECT request_hash, status, response_json
       FROM content_mutation_receipts
       WHERE organization_id = $1 AND actor_id = $2 AND operation = $3 AND idempotency_key = $4
       FOR UPDATE`,
      [input.organizationId, input.actorId, input.operation, input.idempotencyKey]
    );
    const row = existing.rows[0] as { request_hash: string; status: string; response_json: unknown } | undefined;
    if (!row || row.request_hash !== hash) throw new MutationIdempotencyConflictError();
    if (row.status !== "COMPLETED" || row.response_json == null) throw new MutationInProgressError();
    return input.parseCached(row.response_json);
  }

  const result = await input.mutate();
  await input.client.query(
    `UPDATE content_mutation_receipts
     SET status = 'COMPLETED', response_json = $5::jsonb, updated_at = now()
     WHERE organization_id = $1 AND actor_id = $2 AND operation = $3 AND idempotency_key = $4`,
    [input.organizationId, input.actorId, input.operation, input.idempotencyKey, JSON.stringify(result)]
  );
  return result;
}
