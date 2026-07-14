import { NextResponse } from "next/server";
import { z } from "zod";
import { createMockMeetingPipeline } from "@meetingloop/ai";
import { generateDemoMinutesFromTranscript, saveDemoTranscriptSegments } from "@meetingloop/db";
import { generateMinutesInputSchema, transcriptSegmentInputSchema } from "@meetingloop/domain";
import { getSessionPayload } from "../../../session";

const generateMinutesRequestSchema = generateMinutesInputSchema.extend({
  fallbackSegments: z.array(transcriptSegmentInputSchema).optional()
});

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = generateMinutesRequestSchema.safeParse({
    ...(await request.json()),
    organizationId: session.organizationId
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const pipeline = createMockMeetingPipeline();
  try {
    const generate = () => generateDemoMinutesFromTranscript(session.userId, session.role, parsed.data, async (segments) => pipeline.minutes.generateMinutes({
      meetingId: parsed.data.meetingId,
      transcript: segments.map((segment) => ({
        sequence: segment.sequence,
        speakerLabel: segment.speakerLabel,
        editedText: segment.editedText
      }))
    }));
    const minutes = await generate();

    return NextResponse.json({
      status: "GENERATED",
      minutes
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSCRIPT_REQUIRED") {
      if (parsed.data.fallbackSegments?.length) {
        await saveDemoTranscriptSegments(session.userId, session.role, {
          organizationId: session.organizationId,
          meetingId: parsed.data.meetingId,
          segments: parsed.data.fallbackSegments
        });
        const minutes = await generateDemoMinutesFromTranscript(session.userId, session.role, parsed.data, async (segments) => pipeline.minutes.generateMinutes({
          meetingId: parsed.data.meetingId,
          transcript: segments.map((segment) => ({
            sequence: segment.sequence,
            speakerLabel: segment.speakerLabel,
            editedText: segment.editedText
          }))
        }));
        return NextResponse.json({
          status: "GENERATED",
          minutes
        });
      }
      return NextResponse.json({ error: "TRANSCRIPT_REQUIRED" }, { status: 409 });
    }
    throw error;
  }
}
