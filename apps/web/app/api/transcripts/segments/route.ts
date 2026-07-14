import { NextResponse } from "next/server";
import { saveTranscriptSegmentsInputSchema } from "@meetingloop/domain";
import { getDemoTranscriptSegments, saveDemoTranscriptSegments } from "@meetingloop/db";
import { getSessionPayload } from "../../../session";

export async function GET(request: Request) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const meetingId = url.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const segments = await getDemoTranscriptSegments(session.organizationId, meetingId);
  return NextResponse.json({ segments });
}

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = saveTranscriptSegmentsInputSchema.safeParse({
    ...(await request.json()),
    organizationId: session.organizationId
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const segments = await saveDemoTranscriptSegments(session.userId, session.role, parsed.data);
  return NextResponse.json({
    status: "SAVED",
    segments
  });
}
