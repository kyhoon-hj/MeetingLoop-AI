import {
  assertProviderExecutionAllowed,
  createMinutesProvider,
  MinutesProviderError,
  stage1ServerPolicy,
  type MinutesProvider,
  type MinutesProviderKind,
  type ProviderMode
} from "@meetingloop/ai";
import { getProcessingQueueMetrics, type ProcessingQueueMetrics } from "@meetingloop/queue";

export type AiAnalysisMode = "ollama" | "gemini";

export interface AiProviderState {
  available: boolean;
  mode: ProviderMode;
  model: string;
  message: string;
  externalTransmission: boolean;
  estimatedCost: string;
  expectedLatency: string;
  qualityProfile: string;
}

export interface AiStatus {
  defaultMode: AiAnalysisMode;
  activeProvider: MinutesProviderKind;
  mock: AiProviderState;
  ollama: AiProviderState & { serviceReachable: boolean };
  gemini: AiProviderState;
  queue: ProcessingQueueMetrics;
}

const defaultOllamaHost = "http://127.0.0.1:11434";
const defaultOllamaModel = "qwen3:4b";
const defaultGeminiModel = "gemini-3.1-flash-lite";

function demoProviderAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CI === "true";
}

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

  const provider = createMinutesProvider({
    kind,
    geminiApiKey: config.geminiApiKey,
    geminiModel: config.geminiModel,
    ollamaBaseUrl: config.ollamaHost,
    ollamaModel: config.ollamaModel
  });
  try {
    assertProviderExecutionAllowed(provider.capability, {
      ...stage1ServerPolicy,
      allowDemo: kind === "mock" && demoProviderAllowed()
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_PROVIDER_NOT_ALLOWED") {
      throw new MinutesProviderError(
        "AI_CONFIGURATION_REQUIRED",
        "운영 환경에서는 데모 분석기를 사용할 수 없습니다. Ollama 또는 Gemini를 설정해 주세요."
      );
    }
    throw error;
  }

  return {
    provider,
    kind,
    model
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
  const mockAvailable = demoProviderAllowed();
  const queue = analysisQueueStatus();

  return {
    defaultMode: config.defaultMode,
    activeProvider: config.activeProvider,
    mock: {
      available: mockAvailable,
      mode: "demo",
      model: "deterministic-test",
      externalTransmission: false,
      estimatedCost: "없음",
      expectedLatency: "1초 미만",
      qualityProfile: "fixture 규칙 기반 · 실제 품질 아님",
      message: mockAvailable
        ? "개발·CI 전용 데모 분석기입니다. 실제 AI 품질을 나타내지 않습니다."
        : "운영 환경에서는 데모 분석기가 비활성화됩니다."
    },
    ollama: {
      available: serviceReachable && modelInstalled,
      mode: "real",
      serviceReachable,
      model: config.ollamaModel,
      externalTransmission: false,
      estimatedCost: "로컬 장비 비용",
      expectedLatency: "약 10초~3분",
      qualityProfile: "설치 모델과 장비 성능에 따라 변동",
      message: ollamaMessage
    },
    gemini: {
      available: geminiConfigured,
      mode: "real",
      model: config.geminiModel,
      externalTransmission: true,
      estimatedCost: "Gemini API 사용량 기준",
      expectedLatency: "약 3~60초",
      qualityProfile: "외부 모델 기반 구조화 회의록",
      message: geminiConfigured ? "Gemini 무료 API가 준비되었습니다." : "Gemini API 키가 설정되지 않았습니다."
    },
    queue: await queue
  };
}

async function analysisQueueStatus(): Promise<ProcessingQueueMetrics> {
  if (process.env.ANALYSIS_QUEUE_MODE !== "redis") {
    return { mode: "inline", reachable: true, waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, lag: 0, message: "웹 프로세스 inline 분석 모드입니다." };
  }
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return { mode: "redis", reachable: false, waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, lag: 0, message: "REDIS_URL이 설정되지 않았습니다." };
  return getProcessingQueueMetrics(redisUrl);
}
