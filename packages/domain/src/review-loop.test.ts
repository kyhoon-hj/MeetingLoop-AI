import { describe, expect, it } from "vitest";
import {
  assignSpeakerClusterInputSchema,
  assertSameOrganization,
  canAutomaticallyConfirmExtractedItem,
  dictionaryImportInputSchema,
  evidenceLinkSchema,
  extractedItemSchema,
  statementConfidenceThreshold,
  saveTranscriptInputSchema,
  transcriptDraftSegmentSchema,
  transcriptSegmentInputSchema,
  upsertDictionaryTermInputSchema
} from "./index";

describe("review loop contracts", () => {
  it("validates browser-only dictionary CRUD and import rows", () => {
    expect(upsertDictionaryTermInputSchema.parse({
      organizationId: "org-1",
      projectId: "project-1",
      term: "AMANO ONE",
      aliases: ["아마노원"]
    }).category).toBe("TECHNICAL");
    expect(dictionaryImportInputSchema.parse({
      organizationId: "org-1",
      projectId: "project-1",
      rows: [{ term: "MeetingLoop", aliases: ["미팅루프"] }]
    }).rows).toHaveLength(1);
  });

  it("requires a target for scoped speaker confirmation", () => {
    const base = {
      organizationId: "org-1",
      meetingId: "meeting-1",
      clusterId: "cluster-1",
      participantId: "participant-1",
      displayName: "김대리",
      segmentId: null,
      agendaId: null
    };
    expect(assignSpeakerClusterInputSchema.safeParse({ ...base, scope: "SEGMENT" }).success).toBe(false);
    expect(assignSpeakerClusterInputSchema.safeParse({ ...base, scope: "AGENDA" }).success).toBe(false);
    expect(assignSpeakerClusterInputSchema.safeParse({ ...base, scope: "MEETING" }).success).toBe(true);
  });

  it("keeps raw and normalized layers in an explicit browser-only draft", () => {
    const parsed = transcriptDraftSegmentSchema.parse({
      id: "segment-1",
      organizationId: "org-1",
      meetingId: "meeting-1",
      sequence: 0,
      speakerLabel: "Unknown",
      startMs: 0,
      endMs: 1000,
      rawText: "아마노원",
      normalizedText: "AMANO ONE",
      editedText: "AMANO ONE 제품",
      source: "STT",
      status: "LOCAL_DRAFT",
      overlapSeverity: "HIGH",
      speakerStatus: "UNCONFIRMED",
      editedBy: "user-1",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    });
    expect(parsed.persistence).toBe("BROWSER_ONLY");
    expect(parsed.rawText).toBe("아마노원");
    expect(() => transcriptSegmentInputSchema.parse({
      clientId: "server-segment",
      sequence: 0,
      speakerLabel: "Unknown",
      startMs: 0,
      endMs: 1000,
      rawText: parsed.rawText,
      editedText: parsed.editedText,
      status: "CONFIRMED"
    })).toThrow();
  });

  it("never auto-confirms decisions or HIGH-risk evidence", () => {
    const item = extractedItemSchema.parse({
      id: "item-1",
      organizationId: "org-1",
      meetingId: "meeting-1",
      agendaId: null,
      type: "DECISION",
      title: "배포 확정",
      content: "금요일에 배포하기로 결정했습니다.",
      assigneeParticipantId: null,
      assigneeText: null,
      dueDate: null,
      dueDateExpression: null,
      confidence: 0.96,
      reviewStatus: "PENDING",
      audioRiskLevel: "LOW",
      speakerRiskLevel: "LOW",
      overlapRiskLevel: "HIGH",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    });
    const evidence = evidenceLinkSchema.parse({
      id: "evidence-1",
      organizationId: "org-1",
      meetingId: "meeting-1",
      entityType: "EXTRACTED_ITEM",
      entityId: item.id,
      segmentId: "segment-1",
      startMs: 0,
      endMs: 1000,
      evidenceText: item.content,
      evidenceConfidence: 0.96,
      validationStatus: "VALID",
      requiresHumanReview: false,
      validatedBy: "user-1",
      validatedAt: "2026-07-15T00:01:00.000Z",
      createdAt: "2026-07-15T00:00:00.000Z"
    });
    expect(statementConfidenceThreshold("DECISION")).toBe(0.88);
    expect(canAutomaticallyConfirmExtractedItem(item, evidence)).toBe(false);
  });

  it("rejects cross-tenant access and invalid confirmed transcript versions", () => {
    expect(() => assertSameOrganization("org-1", "org-2")).toThrow("ORGANIZATION_SCOPE_VIOLATION");
    expect(saveTranscriptInputSchema.safeParse({
      organizationId: "org-1",
      meetingId: "meeting-1",
      version: -1,
      segments: [{
        sequence: 0,
        speakerLabel: "화자 A",
        startMs: 0,
        endMs: 1000,
        editedText: "확정 전사만 서버에 저장합니다.",
        source: "MANUAL"
      }]
    }).success).toBe(false);
  });
});
