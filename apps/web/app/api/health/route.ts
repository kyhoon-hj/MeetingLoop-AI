import { NextResponse } from "next/server";
import { getDatabaseHealth } from "@meetingloop/db";
import { createMockMeetingPipeline } from "@meetingloop/ai";

export async function GET() {
  const pipeline = createMockMeetingPipeline();
  const transcript = await pipeline.speechToText.transcribe({ recordingId: "health-recording" });

  return NextResponse.json({
    status: "ok",
    app: "MeetingLoop AI",
    timezone: process.env.APP_TIMEZONE ?? "Asia/Seoul",
    database: getDatabaseHealth(),
    aiMode: process.env.AI_MODE ?? "mock",
    mockTranscriptSegments: transcript.length
  });
}
