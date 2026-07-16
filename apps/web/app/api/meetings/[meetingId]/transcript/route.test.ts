import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPayload: vi.fn(),
  getTranscript: vi.fn(),
  saveTranscript: vi.fn()
}));

vi.mock("../../../../session", () => ({ getSessionPayload: mocks.getSessionPayload }));
vi.mock("@meetingloop/db", () => ({
  getTranscript: mocks.getTranscript,
  saveTranscript: mocks.saveTranscript,
  TranscriptVersionConflictError: class TranscriptVersionConflictError extends Error {
    readonly currentVersion: number;
    constructor(currentVersion: number) {
      super("TRANSCRIPT_VERSION_CONFLICT");
      this.currentVersion = currentVersion;
    }
  }
}));

import { TranscriptVersionConflictError } from "@meetingloop/db";
import { GET, PUT } from "./route";

const context = { params: Promise.resolve({ meetingId: "meeting-1" }) };
const session = { userId: "user-1", organizationId: "org-1", role: "EDITOR" };
const input = {
  version: 0,
  segments: [{
    sequence: 0, speakerLabel: "화자 A", startMs: 0, endMs: 1000,
    editedText: "확정 전사", source: "MANUAL"
  }]
};

describe("meeting transcript API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionPayload.mockResolvedValue(session);
    mocks.saveTranscript.mockResolvedValue({ id: "transcript-1", version: 1, segments: [] });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSessionPayload.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("passes route scope and idempotency key to the repository", async () => {
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "transcript-request-123" },
      body: JSON.stringify(input)
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.saveTranscript).toHaveBeenCalledWith("user-1", {
      ...input, organizationId: "org-1", meetingId: "meeting-1"
    }, { idempotencyKey: "transcript-request-123" });
  });

  it("rejects cross-route scope and invalid idempotency keys", async () => {
    const mismatch = await PUT(new Request("http://localhost", {
      method: "PUT", body: JSON.stringify({ ...input, meetingId: "meeting-2" })
    }), context);
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toEqual({ error: "REQUEST_SCOPE_MISMATCH" });

    const invalidKey = await PUT(new Request("http://localhost", {
      method: "PUT", headers: { "Idempotency-Key": "bad key" }, body: JSON.stringify(input)
    }), context);
    expect(invalidKey.status).toBe(400);
    expect(await invalidKey.json()).toEqual({ error: "IDEMPOTENCY_KEY_INVALID" });
    expect(mocks.saveTranscript).not.toHaveBeenCalled();
  });

  it("maps viewer and stale-version failures to controlled responses", async () => {
    mocks.saveTranscript.mockRejectedValueOnce(new Error("TRANSCRIPT_EDIT_FORBIDDEN"));
    const viewer = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(input) }), context);
    expect(viewer.status).toBe(403);

    mocks.saveTranscript.mockRejectedValueOnce(new TranscriptVersionConflictError(2));
    const stale = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(input) }), context);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "TRANSCRIPT_VERSION_CONFLICT", currentVersion: 2 });

    mocks.saveTranscript.mockRejectedValueOnce(new Error("MUTATION_IDEMPOTENCY_CONFLICT"));
    const duplicate = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(input) }), context);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "MUTATION_IDEMPOTENCY_CONFLICT" });
  });
});
