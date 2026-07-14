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

export function createMockMeetingPipeline() {
  return {
    speechToText: new MockSpeechToTextProvider(),
    analysis: new MockMeetingAnalysisProvider(),
    minutes: new MockMinutesProvider()
  };
}
