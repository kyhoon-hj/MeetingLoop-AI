import { describe, expect, it } from "vitest";
import {
  assertRequestScope,
  maxGenerationRequestBytes,
  maxMutationRequestBytes,
  readIdempotencyKey,
  readLimitedJson
} from "./api-request";

describe("meeting-scoped API request guards", () => {
  it("rejects a body organization or meeting that differs from authenticated route scope", () => {
    expect(() => assertRequestScope({ organizationId: "org-2" }, { organizationId: "org-1" }))
      .toThrow("REQUEST_SCOPE_MISMATCH");
    expect(() => assertRequestScope({ meetingId: "meeting-2" }, { organizationId: "org-1", meetingId: "meeting-1" }))
      .toThrow("REQUEST_SCOPE_MISMATCH");
    expect(() => assertRequestScope({}, { organizationId: "org-1", meetingId: "meeting-1" })).not.toThrow();
  });

  it("accepts only bounded idempotency keys", () => {
    expect(readIdempotencyKey(new Request("http://localhost", {
      headers: { "Idempotency-Key": "transcript-request-123" }
    }))).toBe("transcript-request-123");
    expect(() => readIdempotencyKey(new Request("http://localhost", {
      headers: { "Idempotency-Key": "bad key" }
    }))).toThrow("IDEMPOTENCY_KEY_INVALID");
  });

  it("rejects malformed and oversized generic JSON requests", async () => {
    await expect(readLimitedJson(new Request("http://localhost", { method: "POST", body: "{" }), maxGenerationRequestBytes))
      .rejects.toThrow("INVALID_JSON");
    await expect(readLimitedJson(new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": String(maxGenerationRequestBytes + 1) },
      body: "{}"
    }), maxGenerationRequestBytes)).rejects.toThrow("REQUEST_TOO_LARGE");
    await expect(readLimitedJson(new Request("http://localhost", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "x".repeat(maxMutationRequestBytes) })
    }), maxMutationRequestBytes)).rejects.toThrow("REQUEST_TOO_LARGE");
  });
});
