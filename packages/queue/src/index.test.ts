import { describe, expect, it, vi } from "vitest";
import { createBullMqJobId, createIdempotencyKey, createRedisConnection, enqueueProcessingJob } from "./index";

describe("Redis processing queue contracts", () => {
  it("parses Redis and TLS connection URLs", () => {
    expect(createRedisConnection("redis://user:secret@localhost:6380/2")).toMatchObject({ host: "localhost", port: 6380, username: "user", password: "secret", db: 2, maxRetriesPerRequest: null });
    expect(createRedisConnection("rediss://cache.example.com")).toMatchObject({ tls: {} });
    expect(() => createRedisConnection("http://localhost:6379")).toThrow("REDIS_URL_INVALID");
  });

  it("includes transcript revision and provider in the idempotent job id", async () => {
    const descriptor = { meetingId: "meeting-1", type: "minutes.generate" as const, inputVersion: 7, variant: "gemini" };
    const key = createIdempotencyKey(descriptor);
    expect(key).toBe("meeting-1:minutes.generate:v7:gemini");
    expect(createBullMqJobId(key)).toBe("meeting-1-minutes-generate-v7-gemini");
    const add = vi.fn().mockResolvedValue({ id: createBullMqJobId(key) });
    const result = await enqueueProcessingJob({ add } as never, descriptor, { meetingId: "meeting-1" });
    expect(add).toHaveBeenCalledWith("minutes.generate", expect.objectContaining({ idempotencyKey: key }), { jobId: createBullMqJobId(key) });
    expect(result.idempotencyKey).toBe(key);
  });
});
