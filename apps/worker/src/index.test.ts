import { describe, expect, it } from "vitest";
import { getWorkerHealth } from "./index";

describe("worker health", () => {
  it("exposes idempotent mock processing readiness", async () => {
    const health = await getWorkerHealth();

    expect(health.status).toBe("ok");
    expect(health.idempotencyKey).toBe("health-meeting:audio.transcribe");
    expect(health.mockTranscriptSegments).toBe(2);
  });
});
