import { createServer, type Server } from "node:http";
import {
  assertProviderExecutionAllowed,
  createMinutesProvider,
  MinutesProviderError,
  stage1ServerPolicy,
  type MinutesProvider
} from "@meetingloop/ai";
import {
  assertRequiredSchemaMigration,
  assertExternalAiConsent,
  closeDatabasePool,
  generateMinutesFromTranscript,
  getTranscriptForMinutesGeneration,
  requiredSchemaMigration,
  runRetentionSweep
} from "@meetingloop/db";
import type { MeetingMinutes, TranscriptDocument, TranscriptSegment } from "@meetingloop/domain";
import {
  createIdempotencyKey,
  createRedisProcessingQueue,
  createRedisProcessingWorker,
  getProcessingQueueMetrics,
  type MinutesGenerationJobPayload,
  type ProcessingQueueJob
} from "@meetingloop/queue";

export interface MinutesJobResult {
  minutes: MeetingMinutes;
  provider: { kind: MinutesGenerationJobPayload["provider"]; model: string };
  transcriptVersion: number;
}

interface MinutesJobDependencies {
  loadTranscript(userId: string, organizationId: string, meetingId: string): Promise<TranscriptDocument>;
  generateDraft(
    userId: string,
    input: { organizationId: string; meetingId: string },
    generate: (segments: TranscriptSegment[]) => Promise<Pick<MeetingMinutes, "title" | "summary" | "keyPoints" | "discussionTopics" | "decisions" | "actionItems" | "risks" | "openQuestions">>
  ): Promise<MeetingMinutes>;
  provider(payload: MinutesGenerationJobPayload): { provider: MinutesProvider; model: string };
}

function workerProvider(payload: MinutesGenerationJobPayload): { provider: MinutesProvider; model: string } {
  const model = payload.provider === "gemini"
    ? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"
    : payload.provider === "ollama" ? process.env.OLLAMA_MODEL ?? "qwen3:4b" : "deterministic-test";
  const provider = createMinutesProvider({
    kind: payload.provider,
    geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    ollamaBaseUrl: process.env.OLLAMA_HOST,
    ollamaModel: process.env.OLLAMA_MODEL
  });
  assertProviderExecutionAllowed(provider.capability, {
    ...stage1ServerPolicy,
    allowDemo: payload.provider === "mock" && (process.env.NODE_ENV !== "production" || process.env.CI === "true")
  });
  return { provider, model };
}

const defaultDependencies: MinutesJobDependencies = {
  loadTranscript: getTranscriptForMinutesGeneration,
  generateDraft: generateMinutesFromTranscript,
  provider: workerProvider
};

function validatePayload(value: unknown): MinutesGenerationJobPayload {
  const payload = value as Partial<MinutesGenerationJobPayload>;
  if (!payload || typeof payload.organizationId !== "string" || typeof payload.meetingId !== "string"
    || typeof payload.requestedBy !== "string" || !Number.isInteger(payload.transcriptVersion)
    || !["mock", "ollama", "gemini"].includes(String(payload.provider))) {
    throw new Error("INVALID_MINUTES_JOB_PAYLOAD");
  }
  return payload as MinutesGenerationJobPayload;
}

export function createMinutesJobProcessor(dependencies: MinutesJobDependencies = defaultDependencies) {
  return async (job: Pick<ProcessingQueueJob, "data">): Promise<MinutesJobResult> => {
    if (job.data.type !== "minutes.generate") throw new Error("UNSUPPORTED_BROWSER_ONLY_JOB");
    const payload = validatePayload(job.data.payload);
    const expectedKey = createIdempotencyKey({ meetingId: payload.meetingId, type: "minutes.generate", inputVersion: payload.transcriptVersion, variant: payload.provider });
    if (job.data.meetingId !== payload.meetingId || job.data.inputVersion !== payload.transcriptVersion
      || job.data.variant !== payload.provider || job.data.idempotencyKey !== expectedKey) {
      throw new Error("MINUTES_JOB_SCOPE_MISMATCH");
    }
    const transcript = await dependencies.loadTranscript(payload.requestedBy, payload.organizationId, payload.meetingId);
    if (transcript.version !== payload.transcriptVersion) throw new Error("TRANSCRIPT_VERSION_CHANGED");
    if (payload.provider === "gemini") {
      await assertExternalAiConsent(payload.requestedBy, payload.organizationId, payload.meetingId, "gemini");
    }
    const configured = dependencies.provider(payload);
    const minutes = await dependencies.generateDraft(
      payload.requestedBy,
      { organizationId: payload.organizationId, meetingId: payload.meetingId },
      async (segments) => configured.provider.generateMinutes({
        meetingId: payload.meetingId,
        transcript: segments.map((segment) => ({ sequence: segment.sequence, speakerLabel: segment.speakerLabel, editedText: segment.editedText }))
      })
    );
    return { minutes, provider: { kind: payload.provider, model: configured.model }, transcriptVersion: transcript.version };
  };
}

export async function withJobTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("WORKER_JOB_TIMEOUT")), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getWorkerHealth(redisUrl = process.env.REDIS_URL): Promise<Record<string, unknown>> {
  const queue = redisUrl
    ? await getProcessingQueueMetrics(redisUrl)
    : { mode: "inline", reachable: true, waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, lag: 0, message: "Inline 분석 모드입니다." };
  return {
    status: queue.reachable ? "ok" : "degraded",
    worker: "meetingloop-worker",
    schema: requiredSchemaMigration,
    queue,
    allowedJobs: ["minutes.generate"],
    maintenanceJobs: ["retention.purge"],
    retentionSweepEnabled: process.env.RETENTION_SWEEP_ENABLED === "true",
    browserOnlyJobsRejected: true,
    idempotencyKey: createIdempotencyKey({ meetingId: "health-meeting", type: "minutes.generate", inputVersion: 1, variant: "ollama" })
  };
}

function startHealthServer(port: number, health: () => Promise<Record<string, unknown>>): Server {
  return createServer((request, response) => {
    if (request.url !== "/health/ready") { response.writeHead(404).end(); return; }
    void health().then((payload) => {
      const ready = payload.status === "ok";
      response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    }).catch(() => {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "degraded" }));
    });
  }).listen(port, "0.0.0.0");
}

export async function startWorkerRuntime(): Promise<() => Promise<void>> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL_REQUIRED");
  await assertRequiredSchemaMigration();
  const timeoutMs = Number(process.env.WORKER_JOB_TIMEOUT_MS ?? 240_000);
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
  const retentionSweepIntervalMs = Number(process.env.RETENTION_SWEEP_INTERVAL_MS ?? 3_600_000);
  const retentionSweepEnabled = process.env.RETENTION_SWEEP_ENABLED === "true";
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) throw new Error("WORKER_JOB_TIMEOUT_INVALID");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("WORKER_CONCURRENCY_INVALID");
  if (!Number.isInteger(retentionSweepIntervalMs) || retentionSweepIntervalMs < 60_000) throw new Error("RETENTION_SWEEP_INTERVAL_INVALID");

  const processor = createMinutesJobProcessor();
  const worker = createRedisProcessingWorker(redisUrl, (job) => withJobTimeout(processor(job), timeoutMs), concurrency);
  const queue = createRedisProcessingQueue(redisUrl);
  let ready = false;
  worker.on("ready", () => { ready = true; console.log("meetingloop worker ready"); });
  worker.on("error", (error) => { ready = false; console.error("worker connection error", error.name); });
  worker.on("failed", (job, error) => {
    const exhausted = Boolean(job && job.attemptsMade >= Number(job.opts.attempts ?? 1));
    console.error("worker job failed", { jobId: job?.id, type: job?.name, state: exhausted ? "DEAD" : "RETRY", error: error instanceof MinutesProviderError ? error.code : error.message });
  });
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
  const server = startHealthServer(port, async () => ({ ...(await getWorkerHealth(redisUrl)), status: ready ? "ok" : "degraded" }));
  const sweep = () => {
    void runRetentionSweep().then((result) => {
      if (result.scheduled > 0 || result.purged > 0) {
        console.log("retention sweep completed", { scheduled: result.scheduled, purged: result.purged });
      }
    }).catch((error: unknown) => {
      console.error("retention sweep failed", { code: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "RETENTION_SWEEP_FAILED" });
    });
  };
  const retentionTimer = retentionSweepEnabled ? setInterval(sweep, retentionSweepIntervalMs) : null;
  if (retentionSweepEnabled) {
    sweep();
    retentionTimer?.unref();
  }
  let closing = false;
  return async () => {
    if (closing) return;
    closing = true;
    ready = false;
    if (retentionTimer) clearInterval(retentionTimer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await worker.close();
    await queue.close();
    await closeDatabasePool();
  };
}
