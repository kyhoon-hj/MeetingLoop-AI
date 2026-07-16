import { NextResponse } from "next/server";
import { getMinutes, MinutesVersionConflictError, saveMinutes } from "@meetingloop/db";
import { saveMinutesInputSchema } from "@meetingloop/domain";
import { databaseErrorResponse } from "../../../../api-errors";
import {
  assertRequestScope,
  maxMinutesRequestBytes,
  readIdempotencyKey,
  readLimitedJson
} from "../../../../api-request";
import { getSessionPayload } from "../../../../session";
import { logUnexpectedServerError } from "../../../../server-error";

interface RouteContext {
  params: Promise<{ meetingId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const minutes = await getMinutes(session.userId, session.organizationId, meetingId);
    return NextResponse.json({ minutes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "MINUTES_NOT_FOUND") {
      return NextResponse.json(
        { minutes: null, status: "PENDING" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("minutes.get", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const body = await readLimitedJson(request, maxMinutesRequestBytes);
    assertRequestScope(body, { organizationId: session.organizationId, meetingId });
    const parsed = saveMinutesInputSchema.safeParse({
      ...(typeof body === "object" && body !== null ? body : {}),
      organizationId: session.organizationId,
      meetingId
    });
    if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const minutes = await saveMinutes(session.userId, parsed.data, { idempotencyKey: readIdempotencyKey(request) });
    return NextResponse.json({ status: "CONFIRMED", minutes });
  } catch (error) {
    if (error instanceof MinutesVersionConflictError) {
      return NextResponse.json({ error: error.message, currentVersion: error.currentVersion }, { status: 409 });
    }
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("minutes.put", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
