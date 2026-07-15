import { NextResponse } from "next/server";
import { MinutesVersionConflictError, saveMinutes } from "@meetingloop/db";
import { saveMinutesInputSchema } from "@meetingloop/domain";
import { databaseErrorResponse } from "../../../api-errors";
import { getSessionPayload } from "../../../session";

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = saveMinutesInputSchema.safeParse({
    ...(typeof body === "object" && body !== null ? body : {}),
    organizationId: session.organizationId
  });
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const minutes = await saveMinutes(session.userId, parsed.data);
    return NextResponse.json({ status: "CONFIRMED", minutes });
  } catch (error) {
    if (error instanceof MinutesVersionConflictError) {
      return NextResponse.json({ error: error.message, currentVersion: error.currentVersion }, { status: 409 });
    }
    return databaseErrorResponse(error) ?? NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
