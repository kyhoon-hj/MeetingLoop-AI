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
});
