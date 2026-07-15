import { NextResponse } from "next/server";
import { z } from "zod";
import { MinutesProviderError } from "@meetingloop/ai";
import { generateDemoMinutesFromTranscript, saveDemoTranscriptSegments } from "@meetingloop/db";
import { generateMinutesInputSchema, transcriptSegmentInputSchema } from "@meetingloop/domain";
import { configuredMinutesProvider } from "../../../ai-config";
import { getSessionPayload } from "../../../session";

const generateMinutesRequestSchema = generateMinutesInputSchema.extend({
  fallbackSegments: z.array(transcriptSegmentInputSchema).optional(),
  provider: z.enum(["ollama", "gemini"]).default("ollama")
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

  const configured = configuredMinutesProvider(parsed.data.provider);
  const generate = () => generateDemoMinutesFromTranscript(session.userId, session.role, parsed.data, async (segments) => configured.provider.generateMinutes({
    meetingId: parsed.data.meetingId,
    transcript: segments.map((segment) => ({
      sequence: segment.sequence,
      speakerLabel: segment.speakerLabel,
      editedText: segment.editedText
    }))
  }));

  try {
    if (parsed.data.fallbackSegments !== undefined) {
      if (parsed.data.fallbackSegments.length === 0) {
        return NextResponse.json({ error: "TRANSCRIPT_REQUIRED" }, { status: 409 });
      }
      await saveDemoTranscriptSegments(session.userId, session.role, {
        organizationId: session.organizationId,
        meetingId: parsed.data.meetingId,
        segments: parsed.data.fallbackSegments
      });
    }

    const minutes = await generate();

    return NextResponse.json({
      status: "GENERATED",
      provider: { kind: configured.kind, model: configured.model },
      analysisInput: {
        source: parsed.data.fallbackSegments !== undefined ? "CURRENT_TRANSCRIPT" : "SAVED_TRANSCRIPT",
        segmentCount: parsed.data.fallbackSegments?.length ?? 0
      },
      minutes
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSCRIPT_REQUIRED") {
      return NextResponse.json({ error: "TRANSCRIPT_REQUIRED" }, { status: 409 });
    }
    if (error instanceof MinutesProviderError) {
      const status = error.code === "AI_RATE_LIMITED" ? 429 : error.code === "AI_RESPONSE_INVALID" ? 502 : 503;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    throw error;
  }
}
