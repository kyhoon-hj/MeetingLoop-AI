import { describe, expect, it } from "vitest";
import {
  createMockMeetingPipeline,
  GeminiMinutesProvider,
  OllamaMinutesProvider
} from "./index";
import type { MinutesProviderError } from "./index";

const transcript = [{
  sequence: 3,
  speakerLabel: "화자 A",
  editedText: "신규 화면은 금요일까지 검토하고 김대리가 결과를 공유하기로 했습니다."
}];

const minutesDraft = {
  title: "신규 화면 검토 회의",
  summary: "신규 화면 검토 일정과 결과 공유 담당자를 확정했습니다.",
  keyPoints: ["신규 화면을 금요일까지 검토합니다."],
  discussionTopics: ["신규 화면 검토 일정"],
  decisions: ["금요일까지 신규 화면을 검토합니다."],
  actionItems: [{
    id: "action-1",
    content: "검토 결과를 공유한다.",
    assignee: "김대리",
    dueDate: null,
    evidenceSegmentSequence: 3
  }],
  risks: [],
  openQuestions: []
};

describe("mock meeting pipeline", () => {
  it("returns deterministic transcript and evidence-backed decisions", async () => {
    const pipeline = createMockMeetingPipeline();
    const transcript = await pipeline.speechToText.transcribe({ recordingId: "recording-1" });
    const analysis = await pipeline.analysis.analyzeMeeting({ meetingId: "meeting-1", transcript });

    expect(transcript).toHaveLength(2);
    expect(analysis.titleCandidates).toHaveLength(3);
    expect(analysis.decisions[0]?.evidenceSegmentSequence).toBe(1);
  });
});

describe("real minutes providers", () => {
  it("generates structured minutes through a local Ollama model", async () => {
    const request = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:11434/api/chat");
      const body = JSON.parse(String(init?.body)) as { model: string; format: { required: string[] } };
      expect(body.model).toBe("qwen3:4b");
      expect(body.format.required).toContain("summary");
      return Response.json({ message: { content: JSON.stringify(minutesDraft) } });
    }) as typeof fetch;
    const provider = new OllamaMinutesProvider({ request });

    await expect(provider.generateMinutes({ meetingId: "meeting-1", transcript })).resolves.toEqual(minutesDraft);
  });

  it("generates structured minutes through Gemini without putting the key in the URL", async () => {
    const request = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain("gemini-2.5-flash-lite:generateContent");
      expect(String(input)).not.toContain("secret-key");
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("secret-key");
      const body = JSON.parse(String(init?.body)) as { generationConfig: { responseMimeType: string } };
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(minutesDraft) }] } }]
      });
    }) as typeof fetch;
    const provider = new GeminiMinutesProvider({ apiKey: "secret-key", request });

    await expect(provider.generateMinutes({ meetingId: "meeting-1", transcript })).resolves.toEqual(minutesDraft);
  });

  it("requires a Gemini API key instead of silently falling back to mock data", async () => {
    const provider = new GeminiMinutesProvider();

    await expect(provider.generateMinutes({ meetingId: "meeting-1", transcript })).rejects.toMatchObject({
      code: "AI_CONFIGURATION_REQUIRED"
    } satisfies Partial<MinutesProviderError>);
  });
});
