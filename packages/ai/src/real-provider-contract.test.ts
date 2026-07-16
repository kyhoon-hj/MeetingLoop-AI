import { describe, expect, it } from "vitest";
import { GeminiMinutesProvider, OllamaMinutesProvider } from "./index";
import { assertProviderExecutionAllowed, stage1ServerPolicy } from "./provider-capabilities";

describe("real provider capability contract", () => {
  it("allows confirmed-text providers under the server policy", () => {
    const ollama = new OllamaMinutesProvider();
    const gemini = new GeminiMinutesProvider({ apiKey: "fixture" });
    for (const provider of [ollama, gemini]) {
      expect(provider.capability).toMatchObject({
        mode: "real",
        requiresAudioUpload: false,
        supportsServerPersistence: true,
        acceptsConfirmedText: true
      });
      expect(() => assertProviderExecutionAllowed(provider.capability, stage1ServerPolicy)).not.toThrow();
    }
    expect(ollama.capability.externalTransmission).toBe(false);
    expect(gemini.capability.externalTransmission).toBe(true);
  });

  it("rejects any provider that needs raw audio upload", () => {
    expect(() => assertProviderExecutionAllowed({
      id: "forbidden-audio-stt", mode: "real", requiresAudioUpload: true,
      supportsServerPersistence: false, acceptsConfirmedText: false, externalTransmission: true
    }, stage1ServerPolicy)).toThrow("AUDIO_UPLOAD_NOT_ALLOWED");
  });
});
