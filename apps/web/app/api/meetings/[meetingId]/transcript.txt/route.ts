import { NextResponse } from "next/server";
import { formatTranscriptText, getTranscript } from "@meetingloop/db";
import { databaseErrorResponse } from "../../../../api-errors";
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
    const transcript = await getTranscript(session.userId, session.organizationId, meetingId);
    const safeMeetingId = meetingId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return new Response(`\uFEFF${formatTranscriptText(transcript)}\n`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeMeetingId}-transcript-v${transcript.version}.txt"`,
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  } catch (error) {
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("transcript.txt.get", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
