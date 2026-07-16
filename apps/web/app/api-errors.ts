import { NextResponse } from "next/server";
import { ApiRequestError } from "./api-request";

const forbiddenErrors = new Set([
  "PROJECT_MANAGE_FORBIDDEN",
  "MEETING_CREATE_FORBIDDEN",
  "TRANSCRIPT_EDIT_FORBIDDEN",
  "MINUTES_EDIT_FORBIDDEN",
  "MINUTES_CONFIRM_FORBIDDEN",
  "MEETING_DELETE_FORBIDDEN"
]);

export function databaseErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ApiRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "MEMBERSHIP_INACTIVE") {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (forbiddenErrors.has(code)) {
    return NextResponse.json({ error: code }, { status: 403 });
  }
  if (code === "MEETING_NOT_FOUND" || code === "PROJECT_NOT_FOUND" || code === "TRANSCRIPT_NOT_FOUND" || code === "MINUTES_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  if (code === "TRANSCRIPT_REQUIRED") {
    return NextResponse.json({ error: code }, { status: 409 });
  }
  if (code === "EXTERNAL_AI_CONSENT_REQUIRED") {
    return NextResponse.json({ error: code }, { status: 428 });
  }
  if (code === "MUTATION_IDEMPOTENCY_CONFLICT" || code === "MUTATION_IN_PROGRESS") {
    return NextResponse.json({ error: code }, { status: 409 });
  }
  if (code === "IDEMPOTENCY_KEY_INVALID") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "CONSENT_TIMESTAMP_INVALID") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  return null;
}
