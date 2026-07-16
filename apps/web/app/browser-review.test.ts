import { describe, expect, it } from "vitest";
import {
  addDictionaryTerm,
  applyDictionary,
  assignSpeaker,
  createBrowserReviewState,
  decideReviewItem,
  dictionarySuggestions,
  parseDictionaryImport,
  reprocessSegment,
  unresolvedDecisionCount,
  validateEvidence,
  virtualWindow,
  type BrowserReviewSegment
} from "./browser-review";

function segment(overrides: Partial<BrowserReviewSegment> = {}): BrowserReviewSegment {
  return {
    id: "segment-1",
    timecode: "00:10",
    speaker: "화자 A",
    rawText: "  미팅루프  도입을 결정 했습니다. ",
    normalizedText: "미팅루프 도입을 결정 했습니다.",
    editedText: "미팅루프 도입을 결정 했습니다.",
    source: "LIVE",
    confidence: 0.68,
    overlapSeverity: "HIGH",
    speakerStatus: "UNCONFIRMED",
    ...overrides
  };
}

describe("browser-only transcript review", () => {
  it("keeps decisions blocked until speaker and evidence are confirmed", () => {
    let state = createBrowserReviewState("meeting-1", 3, [segment()]);
    expect(unresolvedDecisionCount(state.reviewItems)).toBe(1);
    expect(state.reviewItems[0]?.blockers).toEqual([
      "화자 확인 필요",
      "고중첩 음성 확인 필요",
      "근거 구간 확인 필요"
    ]);

    const cluster = state.speakerClusters[0]!;
    state = assignSpeaker(state, cluster.id, "participant-1", "김민수", "MEETING");
    state = validateEvidence(state, state.reviewItems[0]!.id);
    expect(state.reviewItems[0]?.blockers).toEqual(["고중첩 음성 확인 필요"]);
    expect(decideReviewItem(state, state.reviewItems[0]!.id, "APPROVED").reviewItems[0]?.status).toBe("PENDING");
  });

  it("applies dictionary aliases and records application/edit history", () => {
    let state = createBrowserReviewState("meeting-1", null, [segment({ overlapSeverity: null })]);
    state = addDictionaryTerm(state, "MeetingLoop", ["미팅루프"]);
    state = applyDictionary(state);
    expect(state.segments[0]?.editedText).toContain("MeetingLoop");
    expect(state.dictionaryApplications).toHaveLength(1);
    expect(state.editHistory.at(-1)?.source).toBe("DICTIONARY");
  });

  it("allows explicit approval only after a safe decision review", () => {
    let state = createBrowserReviewState("meeting-1", 1, [segment({ overlapSeverity: null })]);
    state = assignSpeaker(state, state.speakerClusters[0]!.id, "participant-1", "김민수", "MEETING");
    state = validateEvidence(state, state.reviewItems[0]!.id);
    expect(state.reviewItems[0]?.blockers).toEqual([]);
    state = decideReviewItem(state, state.reviewItems[0]!.id, "APPROVED");
    expect(state.reviewItems[0]?.status).toBe("APPROVED");
    expect(unresolvedDecisionCount(state.reviewItems)).toBe(0);
  });

  it("treats an explicitly rejected decision as reviewed", () => {
    let state = createBrowserReviewState("meeting-1", 1, [segment()]);
    state = decideReviewItem(state, state.reviewItems[0]!.id, "REJECTED");
    expect(unresolvedDecisionCount(state.reviewItems)).toBe(0);
  });

  it("imports CSV and JSON dictionary formats", () => {
    expect(parseDictionaryImport("MeetingLoop,미팅루프|미팅 룹")).toEqual([
      { term: "MeetingLoop", aliases: ["미팅루프", "미팅 룹"] }
    ]);
    expect(parseDictionaryImport('[{"term":"PostgreSQL","aliases":["포스트그레스"]}]')).toEqual([
      { term: "PostgreSQL", aliases: ["포스트그레스"] }
    ]);
  });

  it("suggests a dictionary entry after the same correction repeats", () => {
    const state = createBrowserReviewState("meeting-1", null, [
      segment({ id: "one", rawText: "미팅루프 시작", editedText: "MeetingLoop 시작" }),
      segment({ id: "two", rawText: "미팅루프 종료", editedText: "MeetingLoop 종료" })
    ]);
    expect(dictionarySuggestions(state)).toEqual([{ alias: "미팅루프", replacement: "MeetingLoop", occurrenceCount: 2 }]);
  });

  it("reprocesses from immutable raw text and records the revision", () => {
    const state = reprocessSegment(createBrowserReviewState("meeting-1", null, [segment({ normalizedText: "이전", editedText: "이전" })]), "segment-1");
    expect(state.segments[0]?.normalizedText).toBe("미팅루프 도입을 결정 했습니다.");
    expect(state.editHistory.some((item) => item.source === "REPROCESS")).toBe(true);
  });

  it("virtualizes only large transcripts with overscan", () => {
    expect(virtualWindow(20, 5_000, 600)).toEqual({ start: 0, end: 20, paddingTop: 0, paddingBottom: 0 });
    const window = virtualWindow(200, 5_000, 600, 250, 3);
    expect(window.start).toBe(17);
    expect(window.end).toBeLessThan(30);
    expect(window.paddingTop).toBe(4_250);
    expect(window.paddingBottom).toBeGreaterThan(40_000);
  });
});
