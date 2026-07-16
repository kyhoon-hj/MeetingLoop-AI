export const maxTranscriptRequestBytes = 1_048_576;
export const maxMinutesRequestBytes = 524_288;
export const maxGenerationRequestBytes = 16_384;
export const maxMutationRequestBytes = 16_384;

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export async function readLimitedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ApiRequestError("REQUEST_TOO_LARGE", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new ApiRequestError("REQUEST_TOO_LARGE", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiRequestError("INVALID_JSON", 400);
  }
}

export function assertRequestScope(
  body: unknown,
  expected: { organizationId: string; meetingId?: string | undefined }
): void {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return;
  const record = body as Record<string, unknown>;
  if (record.organizationId !== undefined && record.organizationId !== expected.organizationId) {
    throw new ApiRequestError("REQUEST_SCOPE_MISMATCH", 400);
  }
  if (expected.meetingId !== undefined && record.meetingId !== undefined && record.meetingId !== expected.meetingId) {
    throw new ApiRequestError("REQUEST_SCOPE_MISMATCH", 400);
  }
}

export function readIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get("idempotency-key");
  if (value === null) return undefined;
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(value)) {
    throw new ApiRequestError("IDEMPOTENCY_KEY_INVALID", 400);
  }
  return value;
}
