import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmMinutes } from "@meetingloop/db";
import { generateMinutesInputSchema } from "@meetingloop/domain";
import { getSessionPayload } from "../../../session";
import { databaseErrorResponse } from "../../../api-errors";

const actionItemSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1).max(1000),
  assignee: z.string().max(80).nullable(),
  dueDate: z.string().nullable(),
  evidenceSegmentSequence: z.number().int().nonnegative()
});

const finalizeMinutesRequestSchema = generateMinutesInputSchema.extend({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(4000),
  keyPoints: z.array(z.string().min(1).max(1000)).min(1).max(20),
  discussionTopics: z.array(z.string().min(1).max(1000)).max(20),
  decisions: z.array(z.string().min(1).max(1000)).max(20),
  actionItems: z.array(actionItemSchema).max(30),
  risks: z.array(z.string().min(1).max(1000)).max(20),
  openQuestions: z.array(z.string().min(1).max(1000)).max(20)
});

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = finalizeMinutesRequestSchema.safeParse({
    ...(await request.json()),
    organizationId: session.organizationId
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const minutes = await confirmMinutes(session.userId, parsed.data, parsed.data);
    return NextResponse.json({
      status: "CONFIRMED",
      minutes
    });
  } catch (error) {
    return databaseErrorResponse(error) ?? NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
