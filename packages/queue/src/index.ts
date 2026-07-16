import { Queue, Worker, type ConnectionOptions, type Job, type JobsOptions, type Processor } from "bullmq";

export const processingQueueName = "meetingloop-processing";

export type ProcessingJobType = "minutes.generate";
export type MinutesAnalysisProvider = "mock" | "ollama" | "gemini";

export interface ProcessingJobDescriptor {
  meetingId: string;
  type: ProcessingJobType;
  inputVersion: number;
  variant: string;
}

export interface MinutesGenerationJobPayload {
  organizationId: string;
  meetingId: string;
  requestedBy: string;
  transcriptVersion: number;
  provider: MinutesAnalysisProvider;
}

export interface ProcessingJobData<TPayload = unknown> extends ProcessingJobDescriptor {
  idempotencyKey: string;
  payload: TPayload;
}

export interface EnqueuedProcessingJob {
  id: string;
  type: ProcessingJobType;
  idempotencyKey: string;
}

export interface ProcessingQueueMetrics {
  mode: "redis" | "inline";
  reachable: boolean;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  lag: number;
  message: string;
}

export function createIdempotencyKey(job: ProcessingJobDescriptor): string {
  return `${job.meetingId}:${job.type}:v${job.inputVersion}:${job.variant}`;
}

export function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") throw new Error("REDIS_URL_INVALID");
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(database) || database < 0) throw new Error("REDIS_DATABASE_INVALID");
  const port = url.port ? Number(url.port) : 6379;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error("REDIS_PORT_INVALID");
  return {
    host: url.hostname,
    port,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  };
}

export function createBullMqJobId(idempotencyKey: string): string {
  return idempotencyKey.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 160);
}

export function createRedisProcessingQueue(redisUrl: string): Queue<ProcessingJobData> {
  return new Queue<ProcessingJobData>(processingQueueName, {
    connection: createRedisConnection(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 604_800, count: 5_000 }
    }
  });
}

export async function enqueueProcessingJob<TPayload>(
  queue: Pick<Queue<ProcessingJobData<TPayload>>, "add">,
  descriptor: ProcessingJobDescriptor,
  payload: TPayload,
  options: JobsOptions = {}
): Promise<EnqueuedProcessingJob> {
  const idempotencyKey = createIdempotencyKey(descriptor);
  const data: ProcessingJobData<TPayload> = { ...descriptor, idempotencyKey, payload };
  const job = await queue.add(descriptor.type, data, { ...options, jobId: createBullMqJobId(idempotencyKey) });
  return { id: String(job.id ?? createBullMqJobId(idempotencyKey)), type: descriptor.type, idempotencyKey };
}

export function createRedisProcessingWorker(
  redisUrl: string,
  processor: Processor<ProcessingJobData>,
  concurrency = 2
): Worker<ProcessingJobData> {
  return new Worker<ProcessingJobData>(processingQueueName, processor, {
    connection: createRedisConnection(redisUrl),
    concurrency,
    lockDuration: 300_000,
    stalledInterval: 30_000,
    maxStalledCount: 1
  });
}

export async function getProcessingQueueMetrics(redisUrl: string, timeoutMs = 1_500): Promise<ProcessingQueueMetrics> {
  const queue = createRedisProcessingQueue(redisUrl);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const counts = await Promise.race([
      queue.getJobCounts("wait", "active", "delayed", "failed", "completed"),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("QUEUE_STATUS_TIMEOUT")), timeoutMs); })
    ]);
    const waiting = counts.wait ?? 0;
    const active = counts.active ?? 0;
    const delayed = counts.delayed ?? 0;
    return {
      mode: "redis", reachable: true, waiting, active, delayed,
      failed: counts.failed ?? 0, completed: counts.completed ?? 0,
      lag: waiting + delayed,
      message: waiting + delayed > 20 ? "분석 작업이 지연되고 있습니다." : "분석 Queue가 준비되었습니다."
    };
  } catch {
    return { mode: "redis", reachable: false, waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, lag: 0, message: "Redis Queue에 연결할 수 없습니다." };
  } finally {
    if (timer) clearTimeout(timer);
    await queue.disconnect().catch(() => undefined);
  }
}

export type ProcessingQueueJob = Job<ProcessingJobData>;
