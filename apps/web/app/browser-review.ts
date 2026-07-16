export type ReviewSpeakerStatus = "UNCONFIRMED" | "CONFIRMED";
export type ReviewOverlapSeverity = "LOW" | "MEDIUM" | "HIGH" | null;
export type ReviewItemType = "DECISION" | "ACTION_ITEM" | "RISK" | "OPEN_QUESTION";

export interface BrowserReviewSegment {
  id: string;
  timecode: string;
  speaker: string;
  rawText: string;
  normalizedText: string;
  editedText: string;
  source: "LIVE" | "MANUAL" | "STT";
  confidence: number | null;
  overlapSeverity: ReviewOverlapSeverity;
  speakerStatus: ReviewSpeakerStatus;
}

export interface BrowserDictionaryTerm {
  id: string;
  term: string;
  aliases: string[];
  category: "PRODUCT" | "ORGANIZATION" | "PERSON" | "TECHNICAL" | "OTHER";
  source: "MANUAL" | "IMPORT" | "REPEATED_CORRECTION";
  correctionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserEditEvent {
  id: string;
  segmentId: string;
  field: "NORMALIZED_TEXT" | "EDITED_TEXT" | "SPEAKER" | "STATUS";
  previousValue: string;
  nextValue: string;
  source: "USER" | "DICTIONARY" | "REPROCESS";
  createdAt: string;
}

export interface BrowserDictionaryApplication {
  id: string;
  segmentId: string;
  termId: string;
  alias: string;
  replacement: string;
  beforeText: string;
  afterText: string;
  createdAt: string;
}

export interface BrowserSpeakerCluster {
  id: string;
  label: string;
  participantId: string | null;
  confidence: number;
  status: "ACTIVE" | "MERGED" | "SPLIT";
  segmentIds: string[];
  updatedAt: string;
}

export interface BrowserReviewItem {
  id: string;
  segmentId: string;
  type: ReviewItemType;
  content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  evidenceStatus: "PENDING" | "VALID" | "INVALID";
  evidenceText: string;
  blockers: string[];
  updatedAt: string;
}

export interface BrowserReviewState {
  schemaVersion: 1;
  meetingId: string;
  baseTranscriptVersion: number | null;
  segments: BrowserReviewSegment[];
  dictionaryTerms: BrowserDictionaryTerm[];
  dictionaryApplications: BrowserDictionaryApplication[];
  editHistory: BrowserEditEvent[];
  speakerClusters: BrowserSpeakerCluster[];
  reviewItems: BrowserReviewItem[];
  reviewCompleted: boolean;
  updatedAt: string;
}

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function now(): string {
  return new Date().toISOString();
}

export function normalizeTranscriptText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

export function createBrowserReviewState(
  meetingId: string,
  baseTranscriptVersion: number | null,
  segments: BrowserReviewSegment[]
): BrowserReviewState {
  const timestamp = now();
  return {
    schemaVersion: 1,
    meetingId,
    baseTranscriptVersion,
    segments,
    dictionaryTerms: [],
    dictionaryApplications: [],
    editHistory: [],
    speakerClusters: buildSpeakerClusters(segments),
    reviewItems: extractReviewItems(segments),
    reviewCompleted: false,
    updatedAt: timestamp
  };
}

export function buildSpeakerClusters(segments: BrowserReviewSegment[]): BrowserSpeakerCluster[] {
  const groups = new Map<string, BrowserReviewSegment[]>();
  for (const segment of segments) {
    groups.set(segment.speaker, [...(groups.get(segment.speaker) ?? []), segment]);
  }
  const timestamp = now();
  return [...groups.entries()].map(([label, items], index) => ({
    id: `cluster-${index + 1}-${label}`,
    label,
    participantId: null,
    confidence: items.reduce((sum, item) => sum + (item.confidence ?? 0.75), 0) / items.length,
    status: "ACTIVE",
    segmentIds: items.map((item) => item.id),
    updatedAt: timestamp
  }));
}

export function classifyReviewItem(text: string): ReviewItemType | null {
  if (/(결정|확정|합의|승인)/.test(text)) return "DECISION";
  if (/(담당|까지|해야|할 일|액션 아이템)/.test(text)) return "ACTION_ITEM";
  if (/(리스크|위험|우려|장애)/.test(text)) return "RISK";
  if (/[?？]|(미정|추가 검토|확인 필요)/.test(text)) return "OPEN_QUESTION";
  return null;
}

export function decisionBlockers(segment: BrowserReviewSegment, evidenceStatus: BrowserReviewItem["evidenceStatus"]): string[] {
  const blockers: string[] = [];
  if (segment.speakerStatus !== "CONFIRMED") blockers.push("화자 확인 필요");
  if (segment.overlapSeverity === "HIGH") blockers.push("고중첩 음성 확인 필요");
  if (evidenceStatus !== "VALID") blockers.push("근거 구간 확인 필요");
  return blockers;
}

export function extractReviewItems(
  segments: BrowserReviewSegment[],
  previous: BrowserReviewItem[] = []
): BrowserReviewItem[] {
  const previousByKey = new Map(previous.map((item) => [`${item.segmentId}:${item.type}`, item]));
  return segments.flatMap((segment) => {
    const type = classifyReviewItem(segment.editedText);
    if (!type) return [];
    const old = previousByKey.get(`${segment.id}:${type}`);
    const evidenceStatus = old?.evidenceStatus ?? "PENDING";
    const blockers = type === "DECISION" ? decisionBlockers(segment, evidenceStatus) : evidenceStatus === "VALID" ? [] : ["근거 구간 확인 필요"];
    return [{
      id: old?.id ?? id("review"),
      segmentId: segment.id,
      type,
      content: segment.editedText,
      status: old?.status ?? "PENDING",
      evidenceStatus,
      evidenceText: old?.evidenceText ?? segment.editedText,
      blockers,
      updatedAt: old?.updatedAt ?? now()
    } satisfies BrowserReviewItem];
  });
}

export function unresolvedDecisionCount(items: BrowserReviewItem[]): number {
  return items.filter((item) => item.type === "DECISION" && item.status !== "REJECTED" && (item.status === "PENDING" || item.blockers.length > 0)).length;
}

export function addDictionaryTerm(
  state: BrowserReviewState,
  term: string,
  aliases: string[],
  source: BrowserDictionaryTerm["source"] = "MANUAL"
): BrowserReviewState {
  const cleanTerm = term.trim();
  if (!cleanTerm) return state;
  const cleanAliases = [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))].slice(0, 20);
  const timestamp = now();
  const existing = state.dictionaryTerms.find((item) => item.term.toLocaleLowerCase() === cleanTerm.toLocaleLowerCase());
  const dictionaryTerms = existing
    ? state.dictionaryTerms.map((item) => item.id === existing.id
      ? { ...item, aliases: [...new Set([...item.aliases, ...cleanAliases])], updatedAt: timestamp }
      : item)
    : [...state.dictionaryTerms, {
      id: id("term"), term: cleanTerm, aliases: cleanAliases, category: "TECHNICAL" as const, source,
      correctionCount: 0, createdAt: timestamp, updatedAt: timestamp
    }];
  return { ...state, dictionaryTerms, updatedAt: timestamp };
}

export function removeDictionaryTerm(state: BrowserReviewState, termId: string): BrowserReviewState {
  return { ...state, dictionaryTerms: state.dictionaryTerms.filter((item) => item.id !== termId), updatedAt: now() };
}

export function dictionarySuggestions(state: BrowserReviewState): Array<{ alias: string; replacement: string; occurrenceCount: number }> {
  const counts = new Map<string, { alias: string; replacement: string; occurrenceCount: number }>();
  for (const segment of state.segments) {
    const rawWords = segment.rawText.split(/\s+/).filter(Boolean);
    const editedWords = segment.editedText.split(/\s+/).filter(Boolean);
    if (rawWords.length !== editedWords.length) continue;
    rawWords.forEach((alias, index) => {
      const replacement = editedWords[index] ?? alias;
      if (alias === replacement || state.dictionaryTerms.some((term) => term.term === replacement && term.aliases.includes(alias))) return;
      const key = `${alias}\u0000${replacement}`;
      const existing = counts.get(key);
      counts.set(key, { alias, replacement, occurrenceCount: (existing?.occurrenceCount ?? 0) + 1 });
    });
  }
  return [...counts.values()].filter((item) => item.occurrenceCount >= 2).sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

export function parseDictionaryImport(value: string): Array<{ term: string; aliases: string[] }> {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as { term?: unknown; aliases?: unknown };
      if (typeof item.term !== "string" || !item.term.trim()) return [];
      const aliases = Array.isArray(item.aliases) ? item.aliases.filter((alias): alias is string => typeof alias === "string") : [];
      return [{ term: item.term.trim(), aliases }];
    });
  }
  return trimmed.split(/\r?\n/).flatMap((line) => {
    const [term, aliases = ""] = line.split(",", 2);
    if (!term?.trim()) return [];
    return [{ term: term.trim(), aliases: aliases.split(/[|;]/).map((alias) => alias.trim()).filter(Boolean) }];
  });
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyDictionary(state: BrowserReviewState): BrowserReviewState {
  const applications: BrowserDictionaryApplication[] = [];
  const edits: BrowserEditEvent[] = [];
  const timestamp = now();
  const segments = state.segments.map((segment) => {
    let nextText = segment.editedText;
    for (const term of state.dictionaryTerms) {
      for (const alias of term.aliases) {
        if (!alias || alias === term.term) continue;
        const beforeText = nextText;
        nextText = nextText.replace(new RegExp(escaped(alias), "giu"), term.term);
        if (beforeText !== nextText) {
          applications.push({
            id: id("dictionary-application"), segmentId: segment.id, termId: term.id, alias,
            replacement: term.term, beforeText, afterText: nextText, createdAt: timestamp
          });
        }
      }
    }
    if (nextText === segment.editedText) return segment;
    edits.push({ id: id("edit"), segmentId: segment.id, field: "EDITED_TEXT", previousValue: segment.editedText, nextValue: nextText, source: "DICTIONARY", createdAt: timestamp });
    return { ...segment, editedText: nextText };
  });
  return refreshDerived({
    ...state,
    segments,
    dictionaryApplications: [...state.dictionaryApplications, ...applications],
    editHistory: [...state.editHistory, ...edits],
    updatedAt: timestamp
  });
}

export function replaceTranscriptText(state: BrowserReviewState, find: string, replacement: string): BrowserReviewState {
  if (!find) return state;
  const timestamp = now();
  const matcher = new RegExp(escaped(find), "giu");
  const edits: BrowserEditEvent[] = [];
  const segments = state.segments.map((segment) => {
    const nextValue = segment.editedText.replace(matcher, replacement);
    if (nextValue === segment.editedText) return segment;
    edits.push({ id: id("edit"), segmentId: segment.id, field: "EDITED_TEXT", previousValue: segment.editedText, nextValue, source: "USER", createdAt: timestamp });
    return { ...segment, editedText: nextValue };
  });
  return refreshDerived({ ...state, segments, editHistory: [...state.editHistory, ...edits], updatedAt: timestamp });
}

export function patchReviewSegment(
  state: BrowserReviewState,
  segmentId: string,
  patch: Partial<Pick<BrowserReviewSegment, "rawText" | "editedText" | "speaker" | "speakerStatus" | "normalizedText">>,
  source: BrowserEditEvent["source"] = "USER"
): BrowserReviewState {
  const timestamp = now();
  const edits: BrowserEditEvent[] = [];
  const segments = state.segments.map((segment) => {
    if (segment.id !== segmentId) return segment;
    const next = { ...segment, ...patch };
    if (patch.editedText !== undefined && patch.editedText !== segment.editedText) {
      edits.push({ id: id("edit"), segmentId, field: "EDITED_TEXT", previousValue: segment.editedText, nextValue: patch.editedText, source, createdAt: timestamp });
    }
    if (patch.normalizedText !== undefined && patch.normalizedText !== segment.normalizedText) {
      edits.push({ id: id("edit"), segmentId, field: "NORMALIZED_TEXT", previousValue: segment.normalizedText, nextValue: patch.normalizedText, source, createdAt: timestamp });
    }
    if ((patch.speaker !== undefined && patch.speaker !== segment.speaker) || (patch.speakerStatus !== undefined && patch.speakerStatus !== segment.speakerStatus)) {
      edits.push({ id: id("edit"), segmentId, field: "SPEAKER", previousValue: `${segment.speaker}:${segment.speakerStatus}`, nextValue: `${next.speaker}:${next.speakerStatus}`, source, createdAt: timestamp });
    }
    return next;
  });
  return refreshDerived({ ...state, segments, editHistory: [...state.editHistory, ...edits], updatedAt: timestamp });
}

export function reprocessSegment(state: BrowserReviewState, segmentId: string): BrowserReviewState {
  const segment = state.segments.find((item) => item.id === segmentId);
  if (!segment) return state;
  const normalizedText = normalizeTranscriptText(segment.rawText);
  return patchReviewSegment(state, segmentId, { normalizedText, editedText: normalizedText }, "REPROCESS");
}

export function assignSpeaker(
  state: BrowserReviewState,
  clusterId: string,
  participantId: string,
  displayName: string,
  scope: "MEETING" | "SEGMENT",
  segmentId?: string
): BrowserReviewState {
  const cluster = state.speakerClusters.find((item) => item.id === clusterId);
  if (!cluster) return state;
  const ids = scope === "SEGMENT" && segmentId ? [segmentId] : cluster.segmentIds;
  let next = state;
  for (const idValue of ids) next = patchReviewSegment(next, idValue, { speaker: displayName, speakerStatus: "CONFIRMED" });
  return {
    ...next,
    speakerClusters: next.speakerClusters.map((item) => item.id === clusterId || item.label === displayName
      ? { ...item, label: displayName, participantId, confidence: 1, updatedAt: now() }
      : item),
    updatedAt: now()
  };
}

export function mergeSpeakerClusters(state: BrowserReviewState, targetId: string, sourceId: string): BrowserReviewState {
  if (targetId === sourceId) return state;
  const target = state.speakerClusters.find((item) => item.id === targetId);
  const source = state.speakerClusters.find((item) => item.id === sourceId);
  if (!target || !source) return state;
  let next = state;
  for (const segmentId of source.segmentIds) next = patchReviewSegment(next, segmentId, { speaker: target.label, speakerStatus: target.participantId ? "CONFIRMED" : "UNCONFIRMED" });
  return {
    ...next,
    speakerClusters: next.speakerClusters.map((item) => item.id === targetId
      ? { ...item, segmentIds: [...new Set([...target.segmentIds, ...source.segmentIds])], updatedAt: now() }
      : item.id === sourceId ? { ...item, status: "MERGED", updatedAt: now() } : item),
    updatedAt: now()
  };
}

export function splitSpeakerCluster(state: BrowserReviewState, clusterId: string, segmentId: string): BrowserReviewState {
  const cluster = state.speakerClusters.find((item) => item.id === clusterId);
  if (!cluster || !cluster.segmentIds.includes(segmentId) || cluster.segmentIds.length < 2) return state;
  const timestamp = now();
  const nextLabel = `${cluster.label} 분리`;
  const next = patchReviewSegment(state, segmentId, { speaker: nextLabel, speakerStatus: "UNCONFIRMED" });
  return {
    ...next,
    speakerClusters: [
      ...next.speakerClusters.map((item) => item.id === clusterId ? { ...item, segmentIds: item.segmentIds.filter((idValue) => idValue !== segmentId), status: "SPLIT" as const, updatedAt: timestamp } : item),
      { id: id("cluster"), label: nextLabel, participantId: null, confidence: cluster.confidence, status: "ACTIVE", segmentIds: [segmentId], updatedAt: timestamp }
    ],
    updatedAt: timestamp
  };
}

export function validateEvidence(state: BrowserReviewState, itemId: string, evidenceText?: string): BrowserReviewState {
  const timestamp = now();
  const reviewItems = state.reviewItems.map((item) => item.id === itemId
    ? { ...item, evidenceStatus: "VALID" as const, evidenceText: evidenceText?.trim() || item.evidenceText, updatedAt: timestamp }
    : item);
  return refreshReviewBlockers({ ...state, reviewItems, updatedAt: timestamp });
}

export function decideReviewItem(state: BrowserReviewState, itemId: string, action: "APPROVED" | "REJECTED"): BrowserReviewState {
  const current = state.reviewItems.find((item) => item.id === itemId);
  if (!current || (action === "APPROVED" && current.blockers.length > 0)) return state;
  const timestamp = now();
  const reviewItems = state.reviewItems.map((item) => item.id === itemId ? { ...item, status: action, updatedAt: timestamp } : item);
  const completed = reviewItems.length > 0 && reviewItems.every((item) => item.status !== "PENDING");
  return { ...state, reviewItems, reviewCompleted: completed, updatedAt: timestamp };
}

function refreshReviewBlockers(state: BrowserReviewState): BrowserReviewState {
  const segmentById = new Map(state.segments.map((segment) => [segment.id, segment]));
  return {
    ...state,
    reviewItems: state.reviewItems.map((item) => {
      const segment = segmentById.get(item.segmentId);
      if (!segment) return item;
      const blockers = item.type === "DECISION"
        ? decisionBlockers(segment, item.evidenceStatus)
        : item.evidenceStatus === "VALID" ? [] : ["근거 구간 확인 필요"];
      return { ...item, content: segment.editedText, blockers };
    })
  };
}

function refreshDerived(state: BrowserReviewState): BrowserReviewState {
  const previousClusters = new Map(state.speakerClusters.filter((item) => item.status === "ACTIVE").map((item) => [item.label, item]));
  const clusters = buildSpeakerClusters(state.segments).map((cluster) => {
    const previous = previousClusters.get(cluster.label);
    return previous ? { ...cluster, id: previous.id, participantId: previous.participantId, confidence: previous.confidence } : cluster;
  });
  const reviewItems = extractReviewItems(state.segments, state.reviewItems);
  return refreshReviewBlockers({ ...state, speakerClusters: clusters, reviewItems, reviewCompleted: false });
}

export function virtualWindow(total: number, scrollTop: number, viewportHeight: number, rowHeight = 250, overscan = 3) {
  if (total <= 40) return { start: 0, end: total, paddingTop: 0, paddingBottom: 0 };
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewportHeight / rowHeight) + (overscan * 2);
  const end = Math.min(total, start + visible);
  return { start, end, paddingTop: start * rowHeight, paddingBottom: Math.max(0, (total - end) * rowHeight) };
}
