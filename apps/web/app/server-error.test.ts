import { afterEach, describe, expect, it, vi } from "vitest";
import { logUnexpectedServerError } from "./server-error";

describe("safe server error logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a safe database code without logging private error text", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("전사 본문이 포함된 민감한 오류"), { code: "23505" });

    logUnexpectedServerError("transcript.put", error);

    expect(logger).toHaveBeenCalledWith("[server-error]", { context: "transcript.put", code: "23505" });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("전사 본문");
  });

  it("never serializes API keys, signed URLs, audio or transcript payloads", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const privatePayload = {
      message: "https://storage.example/signed?token=secret",
      apiKey: "gemini-secret-key",
      audioBase64: "private-audio",
      transcript: "민감한 전사 문장"
    };
    logUnexpectedServerError("provider.execute", privatePayload);
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain("UnknownError");
    expect(logged).not.toContain("gemini-secret-key");
    expect(logged).not.toContain("private-audio");
    expect(logged).not.toContain("민감한 전사");
    expect(logged).not.toContain("storage.example");
  });
});
