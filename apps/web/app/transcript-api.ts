import type { ZodError } from "zod";
import {
  ApiRequestError,
  maxTranscriptRequestBytes,
  readLimitedJson as readLimitedJsonRequest
} from "./api-request";

export { ApiRequestError as TranscriptRequestError, maxTranscriptRequestBytes };

export function readLimitedJson(request: Request): Promise<unknown> {
  return readLimitedJsonRequest(request, maxTranscriptRequestBytes).catch((error: unknown) => {
    if (error instanceof ApiRequestError && error.message === "REQUEST_TOO_LARGE") {
      throw new ApiRequestError("TRANSCRIPT_REQUEST_TOO_LARGE", error.status);
    }
    throw error;
  });
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
