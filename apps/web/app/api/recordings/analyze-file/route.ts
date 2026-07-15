import { NextResponse } from "next/server";
import { MinutesProviderError } from "@meetingloop/ai";
import { generateDemoMinutesFromTranscript, saveDemoTranscriptSegments } from "@meetingloop/db";
import { configuredAudioTranscriptionProvider, configuredMinutesProvider } from "../../../ai-config";
import { getSessionPayload } from "../../../session";

const maxInlineAudioBytes = 14 * 1024 * 1024;

const mimeTypeByExtension: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm"
};

const supportedMimeTypes = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-flac",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4"
]);

function resolveAudioMimeType(file: File): string | null {
  const provided = file.type.toLowerCase();
  if (supportedMimeTypes.has(provided)) {
    return provided === "video/mp4" ? "audio/mp4" : provided;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return mimeTypeByExtension[extension] ?? null;
}

function parseParticipantNames(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === "string").map((name) => name.trim()).filter(Boolean).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function providerErrorResponse(error: MinutesProviderError) {
  const status = error.code === "AI_RATE_LIMITED" ? 429 : error.code === "AI_RESPONSE_INVALID" ? 502 : 503;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}

export async function POST(request: Request) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  const meetingId = formData.get("meetingId");
  if (!(audio instanceof File) || typeof meetingId !== "string" || !meetingId.trim()) {
    return NextResponse.json({ error: "INVALID_INPUT", message: "녹음 파일과 회의 정보가 필요합니다." }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "EMPTY_AUDIO", message: "선택한 녹음 파일이 비어 있습니다." }, { status: 400 });
  }
  if (audio.size > maxInlineAudioBytes) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE", message: "녹음 파일은 최대 14MB까지 분석할 수 있습니다." }, { status: 413 });
  }

  const mimeType = resolveAudioMimeType(audio);
  if (!mimeType) {
    return NextResponse.json({ error: "UNSUPPORTED_AUDIO_TYPE", message: "MP3, M4A, WAV, WEBM, OGG, AAC, FLAC 파일을 선택해 주세요." }, { status: 400 });
  }

  const transcription = configuredAudioTranscriptionProvider();
  const minutesProvider = configuredMinutesProvider("gemini");
  try {
    const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const transcript = await transcription.provider.transcribeAudio({
      audioBase64,
      mimeType,
      participantNames: parseParticipantNames(formData.get("participantNames"))
    });
    const importedAt = Date.now();
    const savedTranscript = await saveDemoTranscriptSegments(session.userId, session.role, {
      organizationId: session.organizationId,
      meetingId: meetingId.trim(),
      segments: transcript.map((segment) => ({
        clientId: `audio-file-${importedAt}-${segment.sequence}`,
        sequence: segment.sequence,
        speakerLabel: segment.speakerLabel,
        startMs: segment.startMs,
        endMs: segment.endMs,
        rawText: segment.text,
        editedText: segment.text,
        source: "STT" as const,
        status: "CONFIRMED" as const
      }))
    });
    const minutes = await generateDemoMinutesFromTranscript(
      session.userId,
      session.role,
      { organizationId: session.organizationId, meetingId: meetingId.trim() },
      async (segments) => minutesProvider.provider.generateMinutes({
        meetingId: meetingId.trim(),
        transcript: segments.map((segment) => ({
          sequence: segment.sequence,
          speakerLabel: segment.speakerLabel,
          editedText: segment.editedText
        }))
      })
    );

    return NextResponse.json({
      status: "GENERATED",
      file: { name: audio.name, size: audio.size, mimeType },
      transcriptionProvider: { kind: transcription.kind, model: transcription.model },
      provider: { kind: minutesProvider.kind, model: minutesProvider.model },
      analysisInput: { source: "IMPORTED_AUDIO", segmentCount: savedTranscript.length },
      transcript: savedTranscript,
      minutes
    });
  } catch (error) {
    if (error instanceof MinutesProviderError) {
      return providerErrorResponse(error);
    }
    if (error instanceof Error && error.message === "TRANSCRIPT_REQUIRED") {
      return NextResponse.json({ error: "TRANSCRIPT_REQUIRED", message: "녹음에서 분석할 음성을 찾지 못했습니다." }, { status: 409 });
    }
    throw error;
  }
}
