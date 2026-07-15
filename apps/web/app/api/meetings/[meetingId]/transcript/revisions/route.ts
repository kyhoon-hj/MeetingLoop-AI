import { NextResponse } from "next/server";
import { getTranscriptRevisions } from "@meetingloop/db";
import { databaseErrorResponse } from "../../../../../api-errors";
import { getSessionPayload } from "../../../../../session";

interface RouteContext {
  params: Promise<{ meetingId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const revisions = await getTranscriptRevisions(session.userId, session.organizationId, meetingId);
    return NextResponse.json({ revisions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return databaseErrorResponse(error) ?? NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
