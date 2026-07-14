import { NextResponse } from "next/server";
import { z } from "zod";
import { createRecordingStorageKey, createStorageAdapterFromEnv } from "@meetingloop/storage";
import { getSessionPayload } from "../../../session";

const playbackUrlRequestSchema = z.object({
  meetingId: z.string().min(1),
  recordingId: z.string().min(1),
  extension: z.string().min(1).default("webm")
});

const storage = createStorageAdapterFromEnv();

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = playbackUrlRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const bucket = process.env.S3_BUCKET ?? "meetingloop";
  const key = createRecordingStorageKey({
    organizationId: session.organizationId,
    meetingId: parsed.data.meetingId,
    recordingId: parsed.data.recordingId,
    extension: parsed.data.extension
  });
  const url = await storage.createSignedGetUrl({
    bucket,
    key,
    expiresInSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900)
  });

  return NextResponse.json({
    status: "SIGNED",
    bucket,
    key,
    url
  });
}
