import { assertExternalAiConsent, generateMinutesFromTranscript, getTranscriptForMinutesGeneration } from "@meetingloop/db";
import {
  createRedisProcessingQueue,
  enqueueProcessingJob,
  type MinutesGenerationJobPayload
} from "@meetingloop/queue";
import { configuredMinutesProvider, type AiAnalysisMode } from "./ai-config";

const activeGenerations = new Set<string>();

export class MinutesGenerationInProgressError extends Error {
  constructor() {
    super("AI_GENERATION_IN_PROGRESS");
    this.name = "MinutesGenerationInProgressError";
  }
}

export function analysisQueueMode(): "inline" | "redis" {
  return process.env.ANALYSIS_QUEUE_MODE === "redis" ? "redis" : "inline";
}

export async function enqueueMinutesGeneration(input: {
  userId: string;
  organizationId: string;
  meetingId: string;
  provider: AiAnalysisMode;
}) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL_REQUIRED");
  const transcript = await getTranscriptForMinutesGeneration(input.userId, input.organizationId, input.meetingId).catch((error) => {
    if (error instanceof Error && error.message === "TRANSCRIPT_NOT_FOUND") throw new Error("TRANSCRIPT_REQUIRED");
    throw error;
  });
  if (input.provider === "gemini") {
    await assertExternalAiConsent(input.userId, input.organizationId, input.meetingId, "gemini");
  }
  const configured = configuredMinutesProvider(input.provider);
  const payload: MinutesGenerationJobPayload = {
    organizationId: input.organizationId,
    meetingId: input.meetingId,
    requestedBy: input.userId,
    transcriptVersion: transcript.version,
    provider: configured.kind
  };
  const queue = createRedisProcessingQueue(redisUrl);
  try {
    return await enqueueProcessingJob(queue, {
      meetingId: input.meetingId,
      type: "minutes.generate",
      inputVersion: transcript.version,
      variant: configured.kind
    }, payload);
  } finally {
    await queue.close();
  }
}

export async function getMinutesGenerationJob(input: {
  userId: string;
  organizationId: string;
  meetingId: string;
  jobId: string;
}): Promise<
  | ({ status: "GENERATED" } & Awaited<ReturnType<typeof generateMinutesForMeeting>>)
  | { status: "FAILED"; error: string }
  | { status: "PROCESSING"; state: string; progress: unknown }
> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL_REQUIRED");
  await getTranscriptForMinutesGeneration(input.userId, input.organizationId, input.meetingId);
  const queue = createRedisProcessingQueue(redisUrl);
  try {
    const job = await queue.getJob(input.jobId);
    const payload = job?.data.payload as MinutesGenerationJobPayload | undefined;
    if (!job || !payload || payload.organizationId !== input.organizationId || payload.meetingId !== input.meetingId) {
      throw new Error("ANALYSIS_JOB_NOT_FOUND");
    }
    const state = await job.getState();
    if (state === "completed") {
      const result = job.returnvalue as Awaited<ReturnType<typeof generateMinutesForMeeting>>;
      return { status: "GENERATED", ...result };
    }
    if (state === "failed") return { status: "FAILED" as const, error: job.failedReason || "AI_PROVIDER_UNAVAILABLE" };
    return { status: "PROCESSING" as const, state, progress: job.progress };
  } finally {
    await queue.close();
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
    if (input.provider === "gemini") {
      await assertExternalAiConsent(input.userId, input.organizationId, input.meetingId, "gemini");
    }
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
