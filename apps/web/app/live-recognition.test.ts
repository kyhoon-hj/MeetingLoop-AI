import { describe, expect, it } from "vitest";
import { liveRecognitionRecoveryPolicy } from "./live-recognition";

describe("live recognition recovery policy", () => {
  it("treats silence as a normal listening state without stopping recognition", () => {
    const policy = liveRecognitionRecoveryPolicy("no-speech", 1);
    expect(policy.retry).toBe(true);
    expect(policy.retryDelayMs).toBe(1_000);
    expect(policy.message).toContain("잠시 말씀이 없어");
    expect(liveRecognitionRecoveryPolicy("no-speech", 6).retryDelayMs).toBe(10_000);
  });

  it("backs off temporary connection failures and eventually stops retrying", () => {
    expect(liveRecognitionRecoveryPolicy("network", 1).retryDelayMs).toBe(1_000);
    expect(liveRecognitionRecoveryPolicy("network", 4).retryDelayMs).toBe(8_000);
    expect(liveRecognitionRecoveryPolicy("network", 5)).toMatchObject({ retry: false, retryDelayMs: 0 });
  });

  it("does not retry errors that require a user action", () => {
    expect(liveRecognitionRecoveryPolicy("not-allowed", 1).retry).toBe(false);
    expect(liveRecognitionRecoveryPolicy("audio-capture", 1).retry).toBe(false);
    expect(liveRecognitionRecoveryPolicy("language-not-supported", 1).retry).toBe(false);
  });
});
