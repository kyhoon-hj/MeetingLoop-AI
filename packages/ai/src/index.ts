import { z } from "zod";

export const transcriptSegmentResultSchema = z.object({
  sequence: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  speakerClusterId: z.string(),
  rawText: z.string().min(1),
  normalizedText: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

export const meetingAnalysisResultSchema = z.object({
  summary: z.string().min(1),
  titleCandidates: z.array(z.object({
    title: z.string().min(1),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1)
  })).min(1),
  decisions: z.array(z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    evidenceSegmentSequence: z.number().int().nonnegative()
  }))
});

export type TranscriptSegmentResult = z.infer<typeof transcriptSegmentResultSchema>;
export type MeetingAnalysisResult = z.infer<typeof meetingAnalysisResultSchema>;

export interface SpeechToTextProvider {
  transcribe(input: { recordingId: string }): Promise<TranscriptSegmentResult[]>;
}

export interface MeetingAnalysisProvider {
  analyzeMeeting(input: { meetingId: string; transcript: TranscriptSegmentResult[] }): Promise<MeetingAnalysisResult>;
}

export interface TranscriptTextSegment {
  sequence: number;
  speakerLabel: string;
  editedText: string;
}

export interface GeneratedMinutesDraft {
  title: string;
  summary: string;
  keyPoints: string[];
  discussionTopics: string[];
  decisions: string[];
  actionItems: Array<{
    id: string;
    content: string;
    assignee: string | null;
    dueDate: string | null;
    evidenceSegmentSequence: number;
  }>;
  risks: string[];
  openQuestions: string[];
}

export interface MinutesProvider {
  generateMinutes(input: { meetingId: string; transcript: TranscriptTextSegment[] }): Promise<GeneratedMinutesDraft>;
}

export type MinutesProviderKind = "mock" | "ollama" | "gemini";

export type MinutesProviderErrorCode =
  | "AI_CONFIGURATION_REQUIRED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_MODEL_NOT_FOUND"
  | "AI_RATE_LIMITED"
  | "AI_RESPONSE_INVALID";

export class MinutesProviderError extends Error {
  constructor(
    public readonly code: MinutesProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MinutesProviderError";
  }
}

const generatedMinutesDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(4000),
  keyPoints: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
  discussionTopics: z.array(z.string().trim().min(1).max(1000)).max(20),
  decisions: z.array(z.string().trim().min(1).max(1000)).max(20),
  actionItems: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    content: z.string().trim().min(1).max(1000),
    assignee: z.string().trim().nullable(),
    dueDate: z.string().trim().nullable(),
    evidenceSegmentSequence: z.number().int().nonnegative()
  })).max(30),
  risks: z.array(z.string().trim().min(1).max(1000)).max(20),
  openQuestions: z.array(z.string().trim().min(1).max(1000)).max(20)
});

const minutesJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "회의 내용을 대표하는 짧은 한국어 제목" },
    summary: { type: "string", description: "회의 전체 내용을 사실 중심으로 압축한 한국어 요약" },
    keyPoints: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
    discussionTopics: { type: "array", items: { type: "string" }, maxItems: 20 },
    decisions: { type: "array", items: { type: "string" }, maxItems: 20 },
    actionItems: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          assignee: { type: ["string", "null"] },
          dueDate: { type: ["string", "null"], description: "명시된 경우 YYYY-MM-DD, 아니면 null" },
          evidenceSegmentSequence: { type: "integer", minimum: 0 }
        },
        required: ["id", "content", "assignee", "dueDate", "evidenceSegmentSequence"],
        additionalProperties: false
      }
    },
    risks: { type: "array", items: { type: "string" }, maxItems: 20 },
    openQuestions: { type: "array", items: { type: "string" }, maxItems: 20 }
  },
  required: ["title", "summary", "keyPoints", "discussionTopics", "decisions", "actionItems", "risks", "openQuestions"],
  additionalProperties: false
} as const;

const minutesSystemPrompt = [
  "당신은 한국어 회의록 작성 전문가입니다.",
  "제공된 전사 TXT에 명시된 사실만 사용하고, 결정·담당자·기한을 추측하거나 만들어내지 마세요.",
  "결정되지 않은 내용은 미결 질문 또는 리스크에 넣고, 언급되지 않은 항목은 빈 배열로 반환하세요.",
  "할 일의 evidenceSegmentSequence는 근거가 되는 전사 문장 번호여야 합니다.",
  "간결하지만 실제 업무에 바로 사용할 수 있는 회의록을 작성하세요."
].join("\n");

function minutesPrompt(input: { meetingId: string; transcript: TranscriptTextSegment[] }): string {
  const transcript = input.transcript
    .map((segment) => `[문장 ${segment.sequence}] ${segment.speakerLabel}: ${segment.editedText}`)
    .join("\n");

  return [
    `회의 ID: ${input.meetingId}`,
    "아래 전사를 분석해 제목, 요약, 주요 논의, 결정, 할 일, 리스크, 미결 질문을 구조화하세요.",
    "단순히 문장을 복사하지 말고 같은 주제를 묶되, 전사에 없는 사실은 추가하지 마세요.",
    "",
    transcript
  ].join("\n");
}

function parseMinutesJson(value: string): GeneratedMinutesDraft {
  try {
    return generatedMinutesDraftSchema.parse(JSON.parse(value));
  } catch {
    throw new MinutesProviderError("AI_RESPONSE_INVALID", "AI가 유효한 회의록 형식으로 응답하지 않았습니다. 다시 시도해 주세요.");
  }
}

async function fetchWithTimeout(
  request: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(input: { recordingId: string }): Promise<TranscriptSegmentResult[]> {
    void input;
    return [
      {
        sequence: 0,
        startMs: 0,
        endMs: 11000,
        speakerClusterId: "speaker-a",
        rawText: "오늘은 업로드 재시도와 회의록 승인 범위를 정하겠습니다.",
        normalizedText: "오늘은 업로드 재시도와 회의록 승인 범위를 정하겠습니다.",
        confidence: 0.97
      },
      {
        sequence: 1,
        startMs: 11000,
        endMs: 24000,
        speakerClusterId: "speaker-b",
        rawText: "네트워크가 끊겨도 청크가 보존되어야 합니다.",
        normalizedText: "네트워크가 끊겨도 청크가 보존되어야 합니다.",
        confidence: 0.95
      }
    ];
  }
}

export class MockMeetingAnalysisProvider implements MeetingAnalysisProvider {
  async analyzeMeeting(input: { meetingId: string; transcript: TranscriptSegmentResult[] }): Promise<MeetingAnalysisResult> {
    void input;
    const result = {
      summary: "업로드 재시도와 승인 범위를 중심으로 녹음 회의록 MVP의 안정성 기준을 논의했습니다.",
      titleCandidates: [
        {
          title: "녹음 업로드 재시도 및 승인 범위 회의",
          confidence: 0.91,
          reason: "업로드 복구와 승인 흐름이 가장 구체적으로 언급되었습니다."
        },
        {
          title: "회의록 MVP 안정성 점검",
          confidence: 0.82,
          reason: "MVP 검증 관점의 논의가 포함되어 있습니다."
        },
        {
          title: "모바일 녹음 처리 정책 회의",
          confidence: 0.75,
          reason: "모바일 업로드 실패 복구가 핵심 주제입니다."
        }
      ],
      decisions: [
        {
          title: "업로드 청크 보존",
          content: "네트워크 실패 시 업로드 청크를 폐기하지 않고 재시도 가능하게 유지합니다.",
          evidenceSegmentSequence: 1
        }
      ]
    };

    return meetingAnalysisResultSchema.parse(result);
  }
}

export class MockMinutesProvider implements MinutesProvider {
  async generateMinutes(input: { meetingId: string; transcript: TranscriptTextSegment[] }): Promise<GeneratedMinutesDraft> {
    const confirmedText = input.transcript.map((segment) => `${segment.speakerLabel}: ${segment.editedText}`).join("\n");
    const firstSegment = input.transcript[0];
    const discussionTopics = input.transcript.slice(0, 5).map((segment) => `논의: ${segment.editedText}`);
    const risks = input.transcript.some((segment) => /검토|확인|미정|위험|리스크|오류|실패/.test(segment.editedText))
      ? ["전사 TXT에 추가 확인 또는 검토가 필요한 표현이 포함되어 있어 회의록 확정 전 사람이 검수해야 합니다."]
      : ["원본 음성은 서버에 저장하지 않으므로, 확정 전 전사 TXT 품질 검토가 필요합니다."];
    const openQuestions = input.transcript.length > 0
      ? ["담당자, 기한, 승인 기준이 명확하지 않은 항목은 후속 확인이 필요합니다."]
      : [];
    return {
      title: firstSegment ? `${firstSegment.editedText.slice(0, 28)} 회의록` : "전사 기반 회의록",
      summary: confirmedText
        ? `확인된 전사 TXT ${input.transcript.length}개를 기준으로 회의 내용을 정리했습니다. ${confirmedText.slice(0, 120)}`
        : "확인된 전사 TXT가 없어 회의록 초안을 만들 수 없습니다.",
      keyPoints: input.transcript.slice(0, 5).map((segment) => segment.editedText),
      discussionTopics,
      decisions: input.transcript.length > 0 ? [`전사 TXT ${input.transcript.length}개를 기준으로 후속 검토를 진행합니다.`] : [],
      actionItems: input.transcript.length > 0
        ? [{
          id: "action-1",
          content: "저장된 전사 TXT를 검토하고 회의록 초안을 확정한다.",
          assignee: null,
          dueDate: null,
          evidenceSegmentSequence: input.transcript[0]?.sequence ?? 0
        }]
        : [],
      risks,
      openQuestions
    };
  }
}

interface OllamaMinutesProviderOptions {
  baseUrl?: string | undefined;
  model?: string | undefined;
  request?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
}

export class OllamaMinutesProvider implements MinutesProvider {
  readonly kind = "ollama" as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly request: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OllamaMinutesProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.model = options.model ?? "qwen3:4b";
    this.request = options.request ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  async generateMinutes(input: { meetingId: string; transcript: TranscriptTextSegment[] }): Promise<GeneratedMinutesDraft> {
    let response: Response;
    try {
      response = await fetchWithTimeout(this.request, `${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: minutesJsonSchema,
          messages: [
            { role: "system", content: minutesSystemPrompt },
            { role: "user", content: minutesPrompt(input) }
          ],
          options: { temperature: 0.1 }
        })
      }, this.timeoutMs);
    } catch {
      throw new MinutesProviderError(
        "AI_PROVIDER_UNAVAILABLE",
        "로컬 AI에 연결하지 못했습니다. Ollama가 실행 중인지 확인해 주세요."
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new MinutesProviderError(
          "AI_MODEL_NOT_FOUND",
          `로컬 AI 모델 ${this.model}이 설치되어 있지 않습니다.`
        );
      }
      throw new MinutesProviderError("AI_PROVIDER_UNAVAILABLE", "로컬 AI가 회의록을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    const payload = z.object({
      message: z.object({ content: z.string().min(1) })
    }).safeParse(await response.json());
    if (!payload.success) {
      throw new MinutesProviderError("AI_RESPONSE_INVALID", "로컬 AI 응답을 읽지 못했습니다. 다시 시도해 주세요.");
    }

    return parseMinutesJson(payload.data.message.content);
  }
}

interface GeminiMinutesProviderOptions {
  apiKey?: string | undefined;
  model?: string | undefined;
  request?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
}

export class GeminiMinutesProvider implements MinutesProvider {
  readonly kind = "gemini" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly request: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GeminiMinutesProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.model = options.model ?? "gemini-2.5-flash-lite";
    this.request = options.request ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generateMinutes(input: { meetingId: string; transcript: TranscriptTextSegment[] }): Promise<GeneratedMinutesDraft> {
    if (!this.apiKey) {
      throw new MinutesProviderError(
        "AI_CONFIGURATION_REQUIRED",
        "Gemini API 키가 설정되지 않았습니다. GEMINI_API_KEY를 설정해 주세요."
      );
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.request,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: minutesSystemPrompt }] },
            contents: [{ role: "user", parts: [{ text: minutesPrompt(input) }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: minutesJsonSchema,
              temperature: 0.2
            }
          })
        },
        this.timeoutMs
      );
    } catch {
      throw new MinutesProviderError("AI_PROVIDER_UNAVAILABLE", "Gemini에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.");
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new MinutesProviderError("AI_CONFIGURATION_REQUIRED", "Gemini API 키가 올바르지 않거나 사용할 권한이 없습니다.");
      }
      if (response.status === 404) {
        throw new MinutesProviderError("AI_MODEL_NOT_FOUND", `Gemini 모델 ${this.model}을 사용할 수 없습니다.`);
      }
      if (response.status === 429) {
        throw new MinutesProviderError("AI_RATE_LIMITED", "Gemini 무료 사용량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.");
      }
      throw new MinutesProviderError("AI_PROVIDER_UNAVAILABLE", "Gemini가 회의록을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    const payload = z.object({
      candidates: z.array(z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional() }))
        })
      })).min(1)
    }).safeParse(await response.json());
    const content = payload.success
      ? payload.data.candidates[0]?.content.parts.map((part) => part.text ?? "").join("").trim()
      : "";
    if (!content) {
      throw new MinutesProviderError("AI_RESPONSE_INVALID", "Gemini 응답에서 회의록 내용을 찾지 못했습니다. 다시 시도해 주세요.");
    }

    return parseMinutesJson(content);
  }
}

export interface CreateMinutesProviderOptions {
  kind: MinutesProviderKind;
  geminiApiKey?: string | undefined;
  geminiModel?: string | undefined;
  ollamaBaseUrl?: string | undefined;
  ollamaModel?: string | undefined;
  request?: typeof fetch | undefined;
}

export function createMinutesProvider(options: CreateMinutesProviderOptions): MinutesProvider {
  if (options.kind === "gemini") {
    return new GeminiMinutesProvider({
      apiKey: options.geminiApiKey,
      model: options.geminiModel,
      request: options.request
    });
  }
  if (options.kind === "ollama") {
    return new OllamaMinutesProvider({
      baseUrl: options.ollamaBaseUrl,
      model: options.ollamaModel,
      request: options.request
    });
  }
  return new MockMinutesProvider();
}

export function createMockMeetingPipeline() {
  return {
    speechToText: new MockSpeechToTextProvider(),
    analysis: new MockMeetingAnalysisProvider(),
    minutes: new MockMinutesProvider()
  };
}
