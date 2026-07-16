import { describe, expect, it, vi } from "vitest";
import { createMinutesJobProcessor, getWorkerHealth, withJobTimeout } from "./index";

describe("confirmed transcript worker", () => {
  it("processes only the requested confirmed transcript revision", async () => {
    const generateMinutes = vi.fn().mockResolvedValue({ title: "회의록", summary: "요약", keyPoints: ["핵심"], discussionTopics: [], decisions: [], actionItems: [], risks: [], openQuestions: [] });
    const processor = createMinutesJobProcessor({
      loadTranscript: vi.fn().mockResolvedValue({ version: 4 }),
      generateDraft: vi.fn(async (_userId, _input, generate) => ({ ...(await generate([{ sequence: 0, speakerLabel: "김", editedText: "확정 전사" }])), id: "draft-1", version: 0 })),
      provider: () => ({ provider: { capability: {} as never, generateMinutes }, model: "fixture-model" })
    } as never);
    const result = await processor({ data: {
      type: "minutes.generate", meetingId: "meeting-1", inputVersion: 4, variant: "ollama", idempotencyKey: "meeting-1:minutes.generate:v4:ollama",
      payload: { organizationId: "org-1", meetingId: "meeting-1", requestedBy: "user-1", transcriptVersion: 4, provider: "ollama" }
    } } as never);
    expect(result.transcriptVersion).toBe(4);
    expect(generateMinutes).toHaveBeenCalledWith({ meetingId: "meeting-1", transcript: [{ sequence: 0, speakerLabel: "김", editedText: "확정 전사" }] });
  });

  it("rejects a stale transcript revision before provider execution", async () => {
    const processor = createMinutesJobProcessor({ loadTranscript: vi.fn().mockResolvedValue({ version: 5 }), generateDraft: vi.fn(), provider: vi.fn() } as never);
    await expect(processor({ data: {
      type: "minutes.generate", meetingId: "meeting-1", inputVersion: 4, variant: "gemini", idempotencyKey: "meeting-1:minutes.generate:v4:gemini",
      payload: { organizationId: "org-1", meetingId: "meeting-1", requestedBy: "user-1", transcriptVersion: 4, provider: "gemini" }
    } } as never)).rejects.toThrow("TRANSCRIPT_VERSION_CHANGED");
  });

  it("enforces worker timeouts and exposes the policy boundary", async () => {
    await expect(withJobTimeout(new Promise(() => undefined), 5)).rejects.toThrow("WORKER_JOB_TIMEOUT");
    await expect(getWorkerHealth(undefined)).resolves.toMatchObject({
      status: "ok",
      schema: "0007_privacy_retention_operations.sql",
      allowedJobs: ["minutes.generate"],
      browserOnlyJobsRejected: true
    });
  });
});
