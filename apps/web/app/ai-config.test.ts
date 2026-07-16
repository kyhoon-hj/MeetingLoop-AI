import { afterEach, describe, expect, it, vi } from "vitest";
import { MinutesProviderError } from "@meetingloop/ai";
import { configuredMinutesProvider, getAiStatus } from "./ai-config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AI provider policy configuration", () => {
  it("rejects the deterministic demo provider in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CI", "");
    vi.stubEnv("ANALYSIS_PROVIDER", "mock");

    try {
      configuredMinutesProvider("ollama");
      expect.fail("expected the production demo provider to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(MinutesProviderError);
      expect(error).toMatchObject({ code: "AI_CONFIGURATION_REQUIRED" });
    }
  });

  it("allows the demo provider for development and CI fixtures", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ANALYSIS_PROVIDER", "mock");

    const configured = configuredMinutesProvider("gemini");

    expect(configured.kind).toBe("mock");
    expect(configured.provider.capability).toMatchObject({
      mode: "demo",
      externalTransmission: false
    });
  });

  it("reports provider mode, model availability, and external transmission", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CI", "");
    vi.stubEnv("ANALYSIS_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "fixture-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })));

    const status = await getAiStatus();

    expect(status.mock).toMatchObject({ available: false, mode: "demo", externalTransmission: false });
    expect(status.ollama).toMatchObject({ mode: "real", externalTransmission: false });
    expect(status.gemini).toMatchObject({ available: true, mode: "real", externalTransmission: true });
    expect(status.gemini).toMatchObject({ estimatedCost: expect.any(String), expectedLatency: expect.any(String), qualityProfile: expect.any(String) });
    expect(status.queue).toMatchObject({ mode: "inline", reachable: true, lag: 0 });
  });
});
