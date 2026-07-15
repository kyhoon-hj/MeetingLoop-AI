import { NextResponse } from "next/server";

const forbiddenErrors = new Set([
  "PROJECT_MANAGE_FORBIDDEN",
  "MEETING_CREATE_FORBIDDEN",
  "TRANSCRIPT_EDIT_FORBIDDEN",
  "MINUTES_EDIT_FORBIDDEN",
  "MINUTES_CONFIRM_FORBIDDEN"
]);

export function databaseErrorResponse(error: unknown): NextResponse | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "MEMBERSHIP_INACTIVE") {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (forbiddenErrors.has(code)) {
    return NextResponse.json({ error: code }, { status: 403 });
  }
  if (code === "MEETING_NOT_FOUND" || code === "PROJECT_NOT_FOUND" || code === "TRANSCRIPT_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  return null;
}
