import { generateMinutesFromTranscript } from "@meetingloop/db";
import { configuredMinutesProvider, type AiAnalysisMode } from "./ai-config";

const activeGenerations = new Set<string>();

export class MinutesGenerationInProgressError extends Error {
  constructor() {
    super("AI_GENERATION_IN_PROGRESS");
    this.name = "MinutesGenerationInProgressError";
  }
}

export async function generateMinutesForMeeting(input: {
  userId: string;
  organizationId: string;
  meetingId: string;
  provider: AiAnalysisMode;
}) {
  const lockKey = `${input.organizationId}:${input.meetingId}`;
  if (activeGenerations.has(lockKey)) throw new MinutesGenerationInProgressError();
  activeGenerations.add(lockKey);
  try {
    const configured = configuredMinutesProvider(input.provider);
    const minutes = await generateMinutesFromTranscript(input.userId, input, async (segments) => (
      configured.provider.generateMinutes({
        meetingId: input.meetingId,
        transcript: segments.map((segment) => ({
          sequence: segment.sequence,
          speakerLabel: segment.speakerLabel,
          editedText: segment.editedText
        }))
      })
    ));
    return {
      minutes,
      provider: { kind: configured.kind, model: configured.model }
    };
  } finally {
    activeGenerations.delete(lockKey);
  }
}
