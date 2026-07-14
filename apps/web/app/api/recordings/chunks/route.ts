import { NextResponse } from "next/server";
import { z } from "zod";
import { createStorageAdapterFromEnv } from "@meetingloop/storage";
import { getSessionPayload } from "../../../session";

const uploadChunkRequestSchema = z.object({
  chunkId: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  partNumber: z.number().int().positive(),
  meetingId: z.string().min(1).default("local-recording"),
  recordingId: z.string().min(1).default("browser-recorder"),
  bodyBase64: z.string().optional()
});

const storage = createStorageAdapterFromEnv();

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (process.env.ALLOW_RAW_AUDIO_SERVER_UPLOAD !== "true") {
    return NextResponse.json({ error: "RAW_AUDIO_SERVER_UPLOAD_DISABLED" }, { status: 403 });
  }

  const parsed = uploadChunkRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const bodyBuffer = parsed.data.bodyBase64 ? Buffer.from(parsed.data.bodyBase64, "base64") : undefined;
  const body = bodyBuffer
    ? bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength)
    : undefined;

  const uploadInput = {
    organizationId: session.organizationId,
    meetingId: parsed.data.meetingId,
    recordingId: parsed.data.recordingId,
    chunkId: parsed.data.chunkId,
    partNumber: parsed.data.partNumber,
    sizeBytes: parsed.data.sizeBytes,
    mimeType: parsed.data.mimeType
  };
  const uploaded = await storage.uploadChunk(body ? { ...uploadInput, body } : uploadInput);

  return NextResponse.json({
    status: "UPLOADED",
    uploaded
  });
}
