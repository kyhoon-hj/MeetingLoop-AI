import { NextResponse } from "next/server";
import { requestMeetingDeletion } from "@meetingloop/db";
import { meetingDeletionInputSchema } from "@meetingloop/domain";
import { databaseErrorResponse } from "../../../api-errors";
import { assertRequestScope, maxMutationRequestBytes, readLimitedJson } from "../../../api-request";
import { getSessionPayload } from "../../../session";
import { logUnexpectedServerError } from "../../../server-error";

export async function DELETE(request: Request, context: { params: Promise<{ meetingId: string }> }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const body = await readLimitedJson(request, maxMutationRequestBytes);
    assertRequestScope(body, { organizationId: session.organizationId, meetingId });
    const parsed = meetingDeletionInputSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const deletion = await requestMeetingDeletion(session.userId, parsed.data);
    return NextResponse.json({ status: "DELETION_SCHEDULED", deletion });
  } catch (error) {
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("meeting.delete", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
