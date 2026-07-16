import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPayload: vi.fn(),
  getMinutes: vi.fn(),
  saveMinutes: vi.fn()
}));

vi.mock("../../../../session", () => ({ getSessionPayload: mocks.getSessionPayload }));
vi.mock("@meetingloop/db", () => ({
  getMinutes: mocks.getMinutes,
  saveMinutes: mocks.saveMinutes,
  MinutesVersionConflictError: class MinutesVersionConflictError extends Error {
    readonly currentVersion: number;
    constructor(currentVersion: number) {
      super("MINUTES_VERSION_CONFLICT");
      this.currentVersion = currentVersion;
    }
  }
}));

import { PUT } from "./route";

const context = { params: Promise.resolve({ meetingId: "meeting-1" }) };
const session = { userId: "user-1", organizationId: "org-1", role: "EDITOR" };
const input = {
  version: 0, title: "회의록", summary: "요약", keyPoints: ["핵심"], discussionTopics: [],
  decisions: [], actionItems: [], risks: [], openQuestions: []
};

describe("meeting minutes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionPayload.mockResolvedValue(session);
    mocks.saveMinutes.mockResolvedValue({ id: "minutes-1", version: 1 });
  });

  it("passes a validated idempotency key and route scope", async () => {
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "Idempotency-Key": "minutes-request-123" },
      body: JSON.stringify(input)
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.saveMinutes).toHaveBeenCalledWith("user-1", {
      ...input, organizationId: "org-1", meetingId: "meeting-1"
    }, { idempotencyKey: "minutes-request-123" });
  });

  it("rejects oversized and cross-scope bodies before repository access", async () => {
    const oversized = await PUT(new Request("http://localhost", {
      method: "PUT", headers: { "content-length": "600000" }, body: "{}"
    }), context);
    expect(oversized.status).toBe(413);

    const mismatch = await PUT(new Request("http://localhost", {
      method: "PUT", body: JSON.stringify({ ...input, organizationId: "org-2" })
    }), context);
    expect(mismatch.status).toBe(400);
    expect(mocks.saveMinutes).not.toHaveBeenCalled();
  });
});
