import { describe, expect, it } from "vitest";
import { archiveDemoProject, authenticateDemoUser, createDemoMeeting, createDemoProject, generateDemoMinutesFromTranscript, getDemoProjectForOrganization, getDemoTranscriptSegments, getDemoWorkspace, registerDemoOrganization, saveDemoTranscriptSegments, updateDemoProject } from "./index";

describe("demo organization and project repository", () => {
  it("authenticates demo users and returns only organization scoped projects", async () => {
    const session = await authenticateDemoUser("admin@example.com", "ChangeMe123!");
    expect(session?.membership.role).toBe("ORG_ADMIN");

    const workspace = await getDemoWorkspace("user-admin", "org-demo");
    expect(workspace?.projects.every((project) => project.organizationId === "org-demo")).toBe(true);
  });

  it("creates projects only for project managers", async () => {
    const project = await createDemoProject("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      name: "신규 회의록 프로젝트",
      key: "NEW",
      description: "Phase 1 생성 테스트"
    });
    expect(project.createdBy).toBe("user-admin");

    await expect(createDemoProject("user-viewer", "VIEWER", {
      organizationId: "org-demo",
      name: "권한 없는 프로젝트",
      key: "NOPE",
      description: ""
    })).rejects.toThrow("PROJECT_MANAGE_FORBIDDEN");
  });

  it("does not expose projects across organizations", async () => {
    await expect(getDemoProjectForOrganization("org-demo", "project-external")).rejects.toThrow("ORGANIZATION_SCOPE_VIOLATION");
  });

  it("registers a new organization with an admin membership", async () => {
    const timestamp = Date.now().toString();
    const session = await registerDemoOrganization({
      email: `owner-${timestamp}@example.com`,
      password: "ChangeMe123!",
      displayName: "신규 관리자",
      organizationName: "신규 조직",
      organizationSlug: `new-org-${timestamp}`,
      timezone: "Asia/Seoul"
    });

    expect(session.membership.role).toBe("ORG_ADMIN");
    expect(session.organization.slug).toBe(`new-org-${timestamp}`);
  });

  it("updates and archives projects inside the organization scope", async () => {
    const project = await createDemoProject("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      name: "수정 대상 프로젝트",
      key: `UPD-${Date.now().toString().slice(-5)}`,
      description: "수정 전"
    });
    const updated = await updateDemoProject("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      projectId: project.id,
      name: "수정 완료 프로젝트",
      description: "수정 후"
    });
    expect(updated.name).toBe("수정 완료 프로젝트");

    const archived = await archiveDemoProject("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      projectId: project.id
    });
    expect(archived.status).toBe("ARCHIVED");
    const workspace = await getDemoWorkspace("user-admin", "org-demo");
    expect(workspace?.projects.some((item) => item.id === project.id)).toBe(false);
  });

  it("creates a meeting capture bundle with consent, participants, agendas, and fixture recording", async () => {
    const bundle = await createDemoMeeting("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      projectId: "project-recording",
      title: "모바일 녹음 업로드 회의",
      meetingType: "REQUIREMENTS",
      participants: [
        { displayName: "김민수", roleLabel: "백엔드", organizationLabel: "제품팀" },
        { displayName: "이지영", roleLabel: "기획", organizationLabel: "제품팀" }
      ],
      agendas: [
        { title: "녹음 동의", summary: "회의 시작 전 동의 확인" },
        { title: "fixture 업로드", summary: "테스트 오디오 업로드" }
      ],
      consentConfirmed: true,
      fixtureFileName: "demo-meeting.wav",
      fixtureMimeType: "audio/wav",
      fixtureSizeBytes: 2048
    });

    expect(bundle.meeting.status).toBe("REVIEW");
    expect(bundle.meeting.recordingConsentAt).toBeTruthy();
    expect(bundle.participants).toHaveLength(2);
    expect(bundle.agendas).toHaveLength(2);
    expect(bundle.recording.uploadStatus).toBe("COMPLETED");

    await expect(createDemoMeeting("user-viewer", "VIEWER", {
      organizationId: "org-demo",
      projectId: "project-recording",
      title: "권한 없는 회의",
      meetingType: "GENERAL",
      participants: [{ displayName: "조회 사용자", roleLabel: "", organizationLabel: "" }],
      agendas: [{ title: "보기", summary: "" }],
      consentConfirmed: true,
      fixtureFileName: "blocked.wav",
      fixtureMimeType: "audio/wav",
      fixtureSizeBytes: 512
    })).rejects.toThrow("MEETING_CREATE_FORBIDDEN");
  });

  it("saves edited transcript segments without duplicating the same client segment", async () => {
    const bundle = await createDemoMeeting("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      projectId: "project-recording",
      title: `전사 저장 회의 ${Date.now()}`,
      meetingType: "REVIEW",
      participants: [{ displayName: "김민수", roleLabel: "기획", organizationLabel: "제품팀" }],
      agendas: [{ title: "전사 검토", summary: "사용자 수정본 저장" }],
      consentConfirmed: true,
      fixtureFileName: "transcript-save.wav",
      fixtureMimeType: "audio/wav",
      fixtureSizeBytes: 1024
    });

    const firstSave = await saveDemoTranscriptSegments("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      meetingId: bundle.meeting.id,
      segments: [{
        clientId: "client-1",
        sequence: 0,
        speakerLabel: "화자 A",
        startMs: 0,
        endMs: 5000,
        rawText: "원본 전사 문장",
        editedText: "수정한 전사 문장",
        source: "MANUAL",
        status: "CONFIRMED"
      }]
    });
    expect(firstSave).toHaveLength(1);
    expect(firstSave[0]?.rawText).toBe("원본 전사 문장");
    expect(firstSave[0]?.editedText).toBe("수정한 전사 문장");

    await saveDemoTranscriptSegments("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      meetingId: bundle.meeting.id,
      segments: [{
        clientId: "client-1",
        sequence: 0,
        speakerLabel: "화자 A",
        startMs: 0,
        endMs: 5000,
        rawText: "원본 전사 문장",
        editedText: "다시 수정한 전사 문장",
        source: "MANUAL",
        status: "CONFIRMED"
      }]
    });

    const saved = await getDemoTranscriptSegments("org-demo", bundle.meeting.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.editedText).toBe("다시 수정한 전사 문장");
    await expect(saveDemoTranscriptSegments("user-viewer", "VIEWER", {
      organizationId: "org-demo",
      meetingId: bundle.meeting.id,
      segments: [{
        clientId: "blocked",
        sequence: 1,
        speakerLabel: "화자 B",
        startMs: 5000,
        endMs: 9000,
        rawText: "권한 없음",
        editedText: "권한 없음",
        source: "MANUAL",
        status: "CONFIRMED"
      }]
    })).rejects.toThrow("MEETING_CREATE_FORBIDDEN");
  });

  it("generates minutes from saved transcript text only", async () => {
    const bundle = await createDemoMeeting("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      projectId: "project-recording",
      title: `회의록 생성 회의 ${Date.now()}`,
      meetingType: "GENERAL",
      participants: [{ displayName: "김민수", roleLabel: "PM", organizationLabel: "제품팀" }],
      agendas: [{ title: "회의록", summary: "전사 TXT 기반 생성" }],
      consentConfirmed: true,
      fixtureFileName: "minutes.wav",
      fixtureMimeType: "audio/wav",
      fixtureSizeBytes: 1024
    });

    await expect(generateDemoMinutesFromTranscript("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      meetingId: bundle.meeting.id
    }, async () => ({
      title: "빈 회의록",
      summary: "빈 요약",
      keyPoints: ["없음"],
      discussionTopics: [],
      decisions: [],
      actionItems: [],
      risks: [],
      openQuestions: []
    }))).rejects.toThrow("TRANSCRIPT_REQUIRED");

    await saveDemoTranscriptSegments("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      meetingId: bundle.meeting.id,
      segments: [{
        clientId: "minutes-1",
        sequence: 0,
        speakerLabel: "화자 A",
        startMs: 0,
        endMs: 5000,
        rawText: "원본 음성에서 나온 말",
        editedText: "서버에 저장된 확인 전사 TXT",
        source: "MANUAL",
        status: "CONFIRMED"
      }]
    });

    const minutes = await generateDemoMinutesFromTranscript("user-admin", "ORG_ADMIN", {
      organizationId: "org-demo",
      meetingId: bundle.meeting.id
    }, async (segments) => ({
      title: "전사 TXT 기반 회의록",
      summary: segments.map((segment) => segment.editedText).join("\n"),
      keyPoints: segments.map((segment) => segment.editedText),
      discussionTopics: segments.map((segment) => `논의: ${segment.editedText}`),
      decisions: ["전사 TXT만 서버 회의록 근거로 사용한다."],
      actionItems: [{
        id: "action-1",
        content: "회의록 초안을 검토한다.",
        assignee: null,
        dueDate: null,
        evidenceSegmentSequence: 0
      }],
      risks: ["전사 TXT 품질 검토가 필요하다."],
      openQuestions: ["회의록 승인 담당자를 확정해야 한다."]
    }));

    expect(minutes.source).toBe("TRANSCRIPT_TEXT");
    expect(minutes.summary).toContain("서버에 저장된 확인 전사 TXT");
    expect(minutes.discussionTopics[0]).toContain("논의:");
    expect(minutes.risks).toHaveLength(1);
    expect(minutes.openQuestions).toHaveLength(1);
  });
});
