import { describe, expect, it } from "vitest";
import { assertMeetingEditorRole, assertProjectManagerRole, assertSameOrganization, createMeetingInputSchema, createProjectInputSchema, meetingSchema, registerOrganizationInputSchema } from "./index";

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
});
