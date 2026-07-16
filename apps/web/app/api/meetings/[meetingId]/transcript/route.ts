import { NextResponse } from "next/server";
import { TranscriptVersionConflictError, getTranscript, saveTranscript } from "@meetingloop/db";
import { saveTranscriptInputSchema } from "@meetingloop/domain";
import { databaseErrorResponse } from "../../../../api-errors";
import { assertRequestScope, readIdempotencyKey } from "../../../../api-request";
import { getSessionPayload } from "../../../../session";
import { logUnexpectedServerError } from "../../../../server-error";
import { readLimitedJson, TranscriptRequestError, transcriptValidationCode } from "../../../../transcript-api";

interface RouteContext {
  params: Promise<{ meetingId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const transcript = await getTranscript(session.userId, session.organizationId, meetingId);
    return NextResponse.json({ transcript }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSCRIPT_NOT_FOUND") {
      return NextResponse.json(
        { transcript: null, status: "PENDING" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("transcript.get", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const body = await readLimitedJson(request);
    assertRequestScope(body, { organizationId: session.organizationId, meetingId });
    const idempotencyKey = readIdempotencyKey(request);
    const parsed = saveTranscriptInputSchema.safeParse({
      ...(typeof body === "object" && body !== null ? body : {}),
      organizationId: session.organizationId,
      meetingId
    });
    if (!parsed.success) {
      return NextResponse.json({ error: transcriptValidationCode(parsed.error) }, { status: 400 });
    }
    const transcript = await saveTranscript(session.userId, parsed.data, { idempotencyKey });
    return NextResponse.json({ status: "SAVED", transcript });
  } catch (error) {
    if (error instanceof TranscriptRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TranscriptVersionConflictError) {
      return NextResponse.json({ error: error.message, currentVersion: error.currentVersion }, { status: 409 });
    }
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("transcript.put", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
