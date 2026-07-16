import { describe, expect, it } from "vitest";
import { readLimitedJson, maxTranscriptRequestBytes } from "./transcript-api";

describe("transcript request size guard", () => {
  it("parses a request within the size limit", async () => {
    const value = await readLimitedJson(new Request("http://localhost/transcript", {
      method: "PUT",
      body: JSON.stringify({ version: 0, segments: [] })
    }));
    expect(value).toMatchObject({ version: 0 });
  });

  it("rejects a declared oversized request before parsing", async () => {
    const request = new Request("http://localhost/transcript", {
      method: "PUT",
      headers: { "content-length": String(maxTranscriptRequestBytes + 1) },
      body: "{}"
    });
    await expect(readLimitedJson(request)).rejects.toMatchObject({
      message: "TRANSCRIPT_REQUEST_TOO_LARGE",
      status: 413
    });
  });

  it("returns a controlled error for malformed JSON", async () => {
    const request = new Request("http://localhost/transcript", { method: "PUT", body: "{" });
    await expect(readLimitedJson(request)).rejects.toMatchObject({
      message: "INVALID_JSON",
      status: 400
    });
  });
});
