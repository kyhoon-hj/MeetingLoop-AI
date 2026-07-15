import {
  createMinutesProvider,
  GeminiAudioTranscriptionProvider,
  MockAudioTranscriptionProvider,
  type AudioTranscriptionProvider,
  type MinutesProvider,
  type MinutesProviderKind
} from "@meetingloop/ai";

export type AiAnalysisMode = "ollama" | "gemini";

export interface AiProviderState {
  available: boolean;
  model: string;
  message: string;
}

export interface AiStatus {
  defaultMode: AiAnalysisMode;
  activeProvider: MinutesProviderKind;
  ollama: AiProviderState & { serviceReachable: boolean };
  gemini: AiProviderState;
}

const defaultOllamaHost = "http://127.0.0.1:11434";
const defaultOllamaModel = "qwen3:4b";
const defaultGeminiModel = "gemini-3.1-flash-lite";

function environment() {
  const configuredProvider = process.env.ANALYSIS_PROVIDER;
  const activeProvider: MinutesProviderKind = configuredProvider === "mock" || configuredProvider === "gemini" || configuredProvider === "ollama"
    ? configuredProvider
    : "ollama";

  return {
    activeProvider,
    defaultMode: activeProvider === "gemini" ? "gemini" as const : "ollama" as const,
    ollamaHost: (process.env.OLLAMA_HOST ?? defaultOllamaHost).replace(/\/+$/, ""),
    ollamaModel: process.env.OLLAMA_MODEL ?? defaultOllamaModel,
    geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL ?? defaultGeminiModel
  };
}

export function configuredMinutesProvider(requestedMode: AiAnalysisMode): {
  provider: MinutesProvider;
  kind: MinutesProviderKind;
  model: string;
} {
  const config = environment();
  const kind = config.activeProvider === "mock" ? "mock" : requestedMode;
  const model = kind === "gemini" ? config.geminiModel : kind === "ollama" ? config.ollamaModel : "deterministic-test";

  return {
    provider: createMinutesProvider({
      kind,
      geminiApiKey: config.geminiApiKey,
      geminiModel: config.geminiModel,
      ollamaBaseUrl: config.ollamaHost,
      ollamaModel: config.ollamaModel
    }),
    kind,
    model
  };
}

export function configuredAudioTranscriptionProvider(): {
  provider: AudioTranscriptionProvider;
  kind: "mock" | "gemini";
  model: string;
} {
  const config = environment();
  const provider = config.activeProvider === "mock"
    ? new MockAudioTranscriptionProvider()
    : new GeminiAudioTranscriptionProvider({
      apiKey: config.geminiApiKey,
      model: config.geminiModel
    });

  return {
    provider,
    kind: provider.kind,
    model: provider.model
  };
}

export async function getAiStatus(): Promise<AiStatus> {
  const config = environment();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);
  let serviceReachable = false;
  let modelInstalled = false;

  try {
    const response = await fetch(`${config.ollamaHost}/api/tags`, { signal: controller.signal, cache: "no-store" });
    if (response.ok) {
      serviceReachable = true;
      const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
      modelInstalled = (payload.models ?? []).some((item) => {
        const name = item.model ?? item.name ?? "";
        return name === config.ollamaModel || name.startsWith(`${config.ollamaModel}:`);
      });
    }
  } catch {
    serviceReachable = false;
  } finally {
    clearTimeout(timeoutId);
  }

  const ollamaMessage = !serviceReachable
    ? "Ollama가 실행되지 않았습니다."
    : !modelInstalled
      ? `${config.ollamaModel} 모델이 설치되지 않았습니다.`
      : "로컬 AI가 준비되었습니다.";
  const geminiConfigured = config.geminiApiKey.trim().length > 0;

  return {
    defaultMode: config.defaultMode,
    activeProvider: config.activeProvider,
    ollama: {
      available: serviceReachable && modelInstalled,
      serviceReachable,
      model: config.ollamaModel,
      message: ollamaMessage
    },
    gemini: {
      available: geminiConfigured,
      model: config.geminiModel,
      message: geminiConfigured ? "Gemini 무료 API가 준비되었습니다." : "Gemini API 키가 설정되지 않았습니다."
    }
  };
}
