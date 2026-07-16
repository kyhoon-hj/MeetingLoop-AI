import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingApiRequest, type MeetingApiClientError } from "./meeting-api-client";

afterEach(() => vi.unstubAllGlobals());

describe("meeting API client", () => {
  it("fails before a server mutation while offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(meetingApiRequest("/api/meetings/one/transcript", { method: "PUT" }))
      .rejects.toMatchObject({ status: 0, payload: { error: "OFFLINE" } });
  });

  it("retries an idempotent mutation with the same request", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcript: { version: 2 } }), { status: 200 }));
    const payload = await meetingApiRequest<{ transcript: { version: number } }>("https://example.test/transcript", {
      method: "PUT",
      headers: { "Idempotency-Key": "transcript-fixture-key" },
      body: "{}"
    }, { retryCount: 1, request });

    expect(payload.transcript.version).toBe(2);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("surfaces a version conflict without retrying", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      error: "TRANSCRIPT_VERSION_CONFLICT",
      currentVersion: 7
    }), { status: 409 }));

    await expect(meetingApiRequest("https://example.test/transcript", {}, { retryCount: 1, request }))
      .rejects.toEqual(expect.objectContaining<Partial<MeetingApiClientError>>({
        status: 409,
        payload: { error: "TRANSCRIPT_VERSION_CONFLICT", currentVersion: 7 }
      }));
  });
});
