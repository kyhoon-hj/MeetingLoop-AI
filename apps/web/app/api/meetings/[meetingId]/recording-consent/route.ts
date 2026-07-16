import { NextResponse } from "next/server";
import { recordRecordingConsent } from "@meetingloop/db";
import { z } from "zod";
import { databaseErrorResponse } from "../../../../api-errors";
import { assertRequestScope, maxMutationRequestBytes, readLimitedJson } from "../../../../api-request";
import { getSessionPayload } from "../../../../session";
import { logUnexpectedServerError } from "../../../../server-error";

const requestSchema = z.object({
  organizationId: z.string().min(1), meetingId: z.string().min(1), consentConfirmed: z.literal(true),
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/), confirmedAt: z.string().datetime()
}).strict();

export async function POST(request: Request, context: { params: Promise<{ meetingId: string }> }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { meetingId } = await context.params;
  try {
    const body = await readLimitedJson(request, maxMutationRequestBytes);
    assertRequestScope(body, { organizationId: session.organizationId, meetingId });
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const meeting = await recordRecordingConsent(session.userId, parsed.data);
    return NextResponse.json({
      status: "RECORDED", consent: {
        at: meeting.recordingConsentAt, by: meeting.recordingConsentBy, policyVersion: meeting.recordingConsentVersion
      }
    });
  } catch (error) {
    const response = databaseErrorResponse(error);
    if (response) return response;
    logUnexpectedServerError("recording.consent", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
