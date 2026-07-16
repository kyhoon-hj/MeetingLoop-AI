import { NextResponse } from "next/server";
import { MinutesVersionConflictError, saveMinutes } from "@meetingloop/db";
import { saveMinutesInputSchema } from "@meetingloop/domain";
import { databaseErrorResponse } from "../../../api-errors";
import { assertRequestScope, maxMinutesRequestBytes, readIdempotencyKey, readLimitedJson } from "../../../api-request";
import { getSessionPayload } from "../../../session";
import { logUnexpectedServerError } from "../../../server-error";

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const body = await readLimitedJson(request, maxMinutesRequestBytes);
    assertRequestScope(body, { organizationId: session.organizationId });
    const parsed = saveMinutesInputSchema.safeParse({
      ...(typeof body === "object" && body !== null ? body : {}),
      organizationId: session.organizationId
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
    logUnexpectedServerError("minutes.legacy-finalize", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
