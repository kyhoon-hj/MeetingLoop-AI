import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRedisProcessingQueue,
  createRedisProcessingWorker,
  enqueueProcessingJob
} from "../../packages/queue/src/index";

const redisUrl = process.env.REDIS_TEST_URL;
if (!redisUrl) throw new Error("REDIS_TEST_URL is required for the stage 6 Redis integration test");

let executions = 0;
const processor = async () => {
  executions += 1;
  return { ok: true };
};
let queue: ReturnType<typeof createRedisProcessingQueue>;
let worker: ReturnType<typeof createRedisProcessingWorker>;

describe("stage 6 Redis queue idempotency", () => {
  beforeAll(async () => {
    queue = createRedisProcessingQueue(redisUrl);
    worker = createRedisProcessingWorker(redisUrl, processor, 1);
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close(true);
    await queue.disconnect();
  });

  it("executes duplicate submissions for one transcript revision only once", async () => {
    const meetingId = `redis-test-${Date.now()}`;
    const descriptor = { meetingId, type: "minutes.generate" as const, inputVersion: 9, variant: "ollama" };
    const payload = { organizationId: "org-test", meetingId, requestedBy: "user-test", transcriptVersion: 9, provider: "ollama" as const };
    const first = await enqueueProcessingJob(queue, descriptor, payload);
    const second = await enqueueProcessingJob(queue, descriptor, payload);
    expect(second.id).toBe(first.id);

    const deadline = Date.now() + 10_000;
    let state = "";
    while (Date.now() < deadline) {
      state = await (await queue.getJob(first.id))?.getState() ?? "missing";
      if (state === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(state).toBe("completed");
    expect(executions).toBe(1);

    await worker.close(true);
    worker = createRedisProcessingWorker(redisUrl, processor, 1);
    await worker.waitUntilReady();
    const afterRestart = await enqueueProcessingJob(queue, descriptor, payload);
    expect(afterRestart.id).toBe(first.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(executions).toBe(1);
  });
});
