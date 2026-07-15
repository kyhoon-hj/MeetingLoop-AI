import type { ZodError } from "zod";

export const maxTranscriptRequestBytes = 1_048_576;

export class TranscriptRequestError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "TranscriptRequestError";
    this.status = status;
  }
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxTranscriptRequestBytes) {
    throw new TranscriptRequestError("TRANSCRIPT_REQUEST_TOO_LARGE", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxTranscriptRequestBytes) {
    throw new TranscriptRequestError("TRANSCRIPT_REQUEST_TOO_LARGE", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TranscriptRequestError("INVALID_JSON", 400);
  }
}

export function transcriptValidationCode(error: ZodError): string {
  if (error.issues.some((issue) => issue.code === "too_big" && issue.path[0] === "segments" && issue.path.length === 1)) {
    return "TRANSCRIPT_SEGMENT_LIMIT_EXCEEDED";
  }
  if (error.issues.some((issue) => issue.code === "too_big" && issue.path.at(-1) === "editedText")) {
    return "TRANSCRIPT_SEGMENT_TEXT_TOO_LONG";
  }
  const customCode = error.issues.find((issue) => issue.code === "custom")?.message;
  return customCode ?? "INVALID_TRANSCRIPT_INPUT";
}
