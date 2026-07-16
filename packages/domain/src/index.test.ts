import { describe, expect, it } from "vitest";
import {
  assertMeetingEditorRole,
  assertMinutesConfirmerRole,
  assertMinutesEditorRole,
  assertProjectManagerRole,
  assertSameOrganization,
  assertTranscriptEditorRole,
  createMeetingInputSchema,
  createProjectInputSchema,
  meetingSchema,
  registerOrganizationInputSchema,
  saveMinutesInputSchema,
  saveTranscriptInputSchema,
  transcriptSegmentInputSchema
} from "./index";

describe("domain model guards", () => {
  it("validates a minimal meeting", () => {
    const meeting = meetingSchema.parse({
      id: "meeting-1",
      organizationId: "org-1",
      projectId: "project-1",
      title: "정기 회의",
      titleStatus: "PROVISIONAL",
      meetingType: "GENERAL",
      status: "REVIEW",
      startedAt: "2026-07-14T00:00:00.000Z",
      endedAt: null,
      sourceType: "FILE_UPLOAD",
      recordingConsentAt: "2026-07-14T00:00:00.000Z",
      createdBy: "user-1",
      approvedBy: null,
      approvedAt: null,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z"
    });

    expect(meeting.timezone).toBe("Asia/Seoul");
  });

  it("blocks cross-organization access", () => {
    expect(() => assertSameOrganization("org-a", "org-b")).toThrow("ORGANIZATION_SCOPE_VIOLATION");
  });

  it("validates project creation keys and manager roles", () => {
    expect(createProjectInputSchema.parse({
      organizationId: "org-1",
      name: "회의록 개선",
      key: "MINUTES",
      description: ""
    }).key).toBe("MINUTES");
    expect(() => createProjectInputSchema.parse({
      organizationId: "org-1",
      name: "회의록 개선",
      key: "bad key",
      description: ""
    })).toThrow();
    expect(() => assertProjectManagerRole("VIEWER")).toThrow("PROJECT_MANAGE_FORBIDDEN");
  });

  it("validates organization registration slugs", () => {
    expect(registerOrganizationInputSchema.parse({
      email: "new@example.com",
      password: "ChangeMe123!",
      displayName: "새 관리자",
      organizationName: "새 조직",
      organizationSlug: "new-org"
    }).organizationSlug).toBe("new-org");
    expect(() => registerOrganizationInputSchema.parse({
      email: "new@example.com",
      password: "ChangeMe123!",
      displayName: "새 관리자",
      organizationName: "새 조직",
      organizationSlug: "Bad Slug"
    })).toThrow();
  });

  it("validates meeting capture input and editor roles", () => {
    const input = createMeetingInputSchema.parse({
      organizationId: "org-1",
      projectId: "project-1",
      title: "요구사항 회의",
      meetingType: "REQUIREMENTS",
      participants: [{ displayName: "김민수", roleLabel: "백엔드", organizationLabel: "제품팀" }],
      agendas: [{ title: "업로드 재시도", summary: "" }],
      consentConfirmed: true,
      fixtureFileName: "fixture.wav"
    });
    expect(input.fixtureMimeType).toBe("audio/wav");
    expect(() => assertMeetingEditorRole("VIEWER")).toThrow("MEETING_CREATE_FORBIDDEN");
  });

  it("allows only editors to revise or confirm persisted content", () => {
    for (const role of ["ORG_ADMIN", "PROJECT_ADMIN", "EDITOR"] as const) {
      expect(() => assertTranscriptEditorRole(role)).not.toThrow();
      expect(() => assertMinutesEditorRole(role)).not.toThrow();
      expect(() => assertMinutesConfirmerRole(role)).not.toThrow();
    }
    expect(() => assertTranscriptEditorRole("MEMBER")).toThrow("TRANSCRIPT_EDIT_FORBIDDEN");
    expect(() => assertMinutesEditorRole("VIEWER")).toThrow("MINUTES_EDIT_FORBIDDEN");
    expect(() => assertMinutesConfirmerRole("EXTERNAL")).toThrow("MINUTES_CONFIRM_FORBIDDEN");
  });

  it("accepts only confirmed edited transcript text for server persistence", () => {
    const confirmed = {
      clientId: "segment-1",
      sequence: 0,
      speakerLabel: "화자 A",
      startMs: 0,
      endMs: 1000,
      editedText: "사용자가 확인한 최종 전사",
      source: "LIVE" as const,
      status: "CONFIRMED" as const
    };
    expect(transcriptSegmentInputSchema.parse(confirmed).editedText).toContain("최종 전사");
    expect(() => transcriptSegmentInputSchema.parse({ ...confirmed, status: "DRAFT" })).toThrow();
    expect(() => transcriptSegmentInputSchema.parse({ ...confirmed, rawText: "수정 전 임시 전사" })).toThrow();
  });

  it("validates versioned final transcript input and rejects invalid segments", () => {
    const input = {
      organizationId: "org-1",
      meetingId: "meeting-1",
      version: 0,
      segments: [{
        sequence: 0,
        speakerLabel: "화자 A",
        startMs: 0,
        endMs: 1000,
        editedText: "최종 전사",
        source: "MANUAL" as const
      }]
    };
    expect(saveTranscriptInputSchema.parse(input).version).toBe(0);
    expect(() => saveTranscriptInputSchema.parse({
      ...input,
      segments: [{ ...input.segments[0], startMs: 2000, endMs: 1000 }]
    })).toThrow("TRANSCRIPT_SEGMENT_TIME_INVALID");
    expect(() => saveTranscriptInputSchema.parse({
      ...input,
      segments: [input.segments[0], { ...input.segments[0], editedText: "중복 순서" }]
    })).toThrow("TRANSCRIPT_SEQUENCE_DUPLICATED");
    expect(() => saveTranscriptInputSchema.parse({
      ...input,
      segments: [{ ...input.segments[0], editedText: "가".repeat(4001) }]
    })).toThrow();
  });

  it("validates versioned confirmed minutes content", () => {
    const input = {
      organizationId: "org-1", meetingId: "meeting-1", version: 0,
      title: "회의록", summary: "확정 전사 기반 요약", keyPoints: ["핵심 내용"],
      discussionTopics: [], decisions: [], actionItems: [], risks: [], openQuestions: []
    };
    expect(saveMinutesInputSchema.parse(input).version).toBe(0);
    expect(() => saveMinutesInputSchema.parse({ ...input, title: "" })).toThrow();
    expect(() => saveMinutesInputSchema.parse({ ...input, keyPoints: [] })).toThrow();
  });
});
