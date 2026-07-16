"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDictionaryTerm,
  applyDictionary,
  assignSpeaker,
  createBrowserReviewState,
  decideReviewItem,
  dictionarySuggestions,
  mergeSpeakerClusters,
  parseDictionaryImport,
  patchReviewSegment,
  reprocessSegment,
  removeDictionaryTerm,
  replaceTranscriptText,
  splitSpeakerCluster,
  unresolvedDecisionCount,
  validateEvidence,
  virtualWindow,
  type BrowserReviewSegment,
  type BrowserReviewState,
  type ReviewOverlapSeverity,
  type ReviewSpeakerStatus
} from "./browser-review";
import { loadBrowserReviewState, saveBrowserReviewState } from "./browser-review-store";

export interface TranscriptEditorSegment {
  id: string;
  timecode: string;
  speaker: string;
  rawText: string;
  normalizedText: string;
  text: string;
  source: "LIVE" | "MANUAL" | "STT";
  confidence: number | null;
  overlapSeverity: ReviewOverlapSeverity;
  speakerStatus: ReviewSpeakerStatus;
  status: "draft" | "confirmed";
}

export interface TranscriptParticipantOption {
  id: string;
  displayName: string;
}

interface TranscriptEditorProps {
  active: boolean;
  meetingId?: string | undefined;
  transcriptVersion: number | null;
  serverReady: boolean;
  participants: TranscriptParticipantOption[];
  segments: TranscriptEditorSegment[];
  message: string;
  saveMeta: string;
  isLoading: boolean;
  canDownload: boolean;
  onAdd(): void;
  onReload(): void;
  onDownload(): void;
  onSave(): void;
  onDelete(id: string): void;
  onSegmentsChange(segments: TranscriptEditorSegment[]): void;
  onPlaySegment(timecode: string, repeat: boolean): void;
  onReviewGateChange(blockerCount: number): void;
}

const REVIEW_VIEWPORT_HEIGHT = 620;
const REVIEW_ROW_HEIGHT = 330;

function toReviewSegments(segments: TranscriptEditorSegment[]): BrowserReviewSegment[] {
  return segments.map((segment) => ({
    id: segment.id,
    timecode: segment.timecode,
    speaker: segment.speaker,
    rawText: segment.rawText || segment.text,
    normalizedText: segment.normalizedText || segment.rawText || segment.text,
    editedText: segment.text,
    source: segment.source,
    confidence: segment.confidence,
    overlapSeverity: segment.overlapSeverity,
    speakerStatus: segment.speakerStatus
  }));
}

function fromReviewSegments(review: BrowserReviewSegment[], current: TranscriptEditorSegment[]): TranscriptEditorSegment[] {
  const currentById = new Map(current.map((segment) => [segment.id, segment]));
  return review.map((segment) => ({
    ...currentById.get(segment.id),
    id: segment.id,
    timecode: segment.timecode,
    speaker: segment.speaker,
    rawText: segment.rawText,
    normalizedText: segment.normalizedText,
    text: segment.editedText,
    source: segment.source,
    confidence: segment.confidence,
    overlapSeverity: segment.overlapSeverity,
    speakerStatus: segment.speakerStatus,
    status: currentById.get(segment.id)?.status ?? "draft"
  }));
}

function segmentSignature(segments: BrowserReviewSegment[]): string {
  return segments.map((segment) => `${segment.id}:${segment.editedText}:${segment.speaker}:${segment.speakerStatus}`).join("|");
}

function reviewTypeLabel(type: string): string {
  return ({ DECISION: "결정", ACTION_ITEM: "할 일", RISK: "리스크", OPEN_QUESTION: "미결 질문" } as Record<string, string>)[type] ?? type;
}

export default function TranscriptEditor(props: TranscriptEditorProps) {
  const [reviewState, setReviewState] = useState<BrowserReviewState | null>(null);
  const [reviewMessage, setReviewMessage] = useState("브라우저 검토 상태를 준비하고 있습니다.");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [term, setTerm] = useState("");
  const [aliases, setAliases] = useState("");
  const [dictionaryImport, setDictionaryImport] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, string>>({});
  const [mergeSources, setMergeSources] = useState<Record<string, string>>({});
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});
  const [repeatSegmentId, setRepeatSegmentId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const loadedMeetingRef = useRef<string | null>(null);
  const currentSegmentsRef = useRef(props.segments);
  currentSegmentsRef.current = props.segments;

  useEffect(() => {
    if (!props.serverReady) return;
    const meetingId = props.meetingId ?? "unsaved-meeting";
    if (loadedMeetingRef.current === meetingId) return;
    loadedMeetingRef.current = meetingId;
    let active = true;
    const initialSegmentSignature = segmentSignature(toReviewSegments(currentSegmentsRef.current));
    void loadBrowserReviewState(meetingId).then((stored) => {
      if (!active) return;
      const current = toReviewSegments(currentSegmentsRef.current);
      if (segmentSignature(current) !== initialSegmentSignature) {
        const next = createBrowserReviewState(meetingId, props.transcriptVersion, current);
        if (stored) next.dictionaryTerms = stored.dictionaryTerms;
        setReviewState(next);
        setReviewMessage("검토 상태를 불러오는 동안 수정한 전사 내용을 유지했습니다.");
        return;
      }
      if (stored && stored.schemaVersion === 1 && stored.baseTranscriptVersion === props.transcriptVersion) {
        const restored = { ...stored, segments: stored.segments.length > 0 ? stored.segments : current };
        setReviewState(restored);
        if (stored.segments.length > 0) props.onSegmentsChange(fromReviewSegments(stored.segments, currentSegmentsRef.current));
        setReviewMessage("이 브라우저에 저장된 화자·사전·검토 초안을 복원했습니다.");
        return;
      }
      const next = createBrowserReviewState(meetingId, props.transcriptVersion, current);
      if (stored) {
        next.dictionaryTerms = stored.dictionaryTerms;
        setReviewMessage("서버 전사 버전이 달라 오래된 문장 초안은 적용하지 않았습니다. 사전만 유지했습니다.");
      } else {
        setReviewMessage("검토 초안은 이 브라우저에만 저장됩니다. 서버에는 확정 전사만 전송됩니다.");
      }
      setReviewState(next);
    }).catch(() => {
      if (!active) return;
      setReviewState(createBrowserReviewState(meetingId, props.transcriptVersion, toReviewSegments(currentSegmentsRef.current)));
      setReviewMessage("IndexedDB를 사용할 수 없어 현재 탭에서만 검토 상태를 유지합니다.");
    });
    return () => { active = false; };
  }, [props.meetingId, props.onSegmentsChange, props.serverReady, props.transcriptVersion]);

  useEffect(() => {
    if (!reviewState) return;
    const incoming = toReviewSegments(props.segments);
    if (segmentSignature(incoming) === segmentSignature(reviewState.segments)) return;
    const currentById = new Map(reviewState.segments.map((segment) => [segment.id, segment]));
    const merged = incoming.map((segment) => {
      const existing = currentById.get(segment.id);
      return existing ? { ...segment, rawText: existing.rawText, normalizedText: existing.normalizedText } : segment;
    });
    const fresh = createBrowserReviewState(reviewState.meetingId, props.transcriptVersion, merged);
    setReviewState({
      ...fresh,
      dictionaryTerms: reviewState.dictionaryTerms,
      dictionaryApplications: reviewState.dictionaryApplications.filter((item) => merged.some((segment) => segment.id === item.segmentId)),
      editHistory: reviewState.editHistory.filter((item) => merged.some((segment) => segment.id === item.segmentId))
    });
  }, [props.segments, props.transcriptVersion, reviewState]);

  useEffect(() => {
    if (!reviewState) return;
    const timer = window.setTimeout(() => {
      void saveBrowserReviewState(reviewState).catch(() => setReviewMessage("검토 상태를 브라우저 저장소에 기록하지 못했습니다."));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [reviewState]);

  const blockerCount = reviewState ? unresolvedDecisionCount(reviewState.reviewItems) : 0;
  useEffect(() => props.onReviewGateChange(blockerCount), [blockerCount, props.onReviewGateChange]);

  const commit = useCallback((next: BrowserReviewState, message?: string) => {
    setReviewState(next);
    props.onSegmentsChange(fromReviewSegments(next.segments, currentSegmentsRef.current));
    if (message) setReviewMessage(message);
  }, [props.onSegmentsChange]);

  const windowState = useMemo(
    () => virtualWindow(reviewState?.segments.length ?? 0, scrollTop, REVIEW_VIEWPORT_HEIGHT, REVIEW_ROW_HEIGHT),
    [reviewState?.segments.length, scrollTop]
  );
  const visibleSegments = reviewState?.segments.slice(windowState.start, windowState.end) ?? [];
  const reviewed = reviewState?.reviewItems.filter((item) => item.status !== "PENDING").length ?? 0;
  const totalReviews = reviewState?.reviewItems.length ?? 0;
  const suggestions = reviewState ? dictionarySuggestions(reviewState) : [];

  function handleImport() {
    if (!reviewState) return;
    try {
      const rows = parseDictionaryImport(dictionaryImport);
      const next = rows.reduce((state, row) => addDictionaryTerm(state, row.term, row.aliases, "IMPORT"), reviewState);
      commit(next, `사전 ${rows.length}개 항목을 브라우저에 가져왔습니다.`);
      setDictionaryImport("");
    } catch {
      setReviewMessage("사전 가져오기 형식을 확인해 주세요. CSV는 '용어,별칭1|별칭2', JSON은 term/aliases 배열을 사용합니다.");
    }
  }

  return (
    <section className="live-transcript-editor workspace-pane" data-mobile-active={props.active} aria-label="실시간 전사 편집">
      <div className="editor-heading pane-heading">
        <div>
          <strong>전사·화자·근거 검토</strong>
          <p className="muted">{props.message}</p>
          <p className="transcript-save-meta">{props.saveMeta}</p>
          <p className="review-local-message">{reviewMessage}</p>
        </div>
        <div className="toolbar">
          <button className="button secondary" type="button" onClick={props.onAdd}>문장 추가</button>
          <button className="button secondary" type="button" onClick={props.onReload} disabled={props.isLoading}>서버 저장본 다시 불러오기</button>
          <button className="button secondary" type="button" onClick={props.onDownload} disabled={!props.canDownload}>TXT 다운로드</button>
          <button className="button" type="button" onClick={props.onSave}>최종 전사 확정</button>
        </div>
      </div>

      <div className="transcript-review-toolbar" aria-label="전사 찾기와 바꾸기">
        <label>찾기<input value={findText} onChange={(event) => setFindText(event.target.value)} /></label>
        <label>바꾸기<input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} /></label>
        <button className="button secondary" type="button" disabled={!reviewState || !findText} onClick={() => {
          if (reviewState) commit(replaceTranscriptText(reviewState, findText, replaceText), "찾기/바꾸기를 적용하고 편집 이력에 기록했습니다.");
        }}>전체 바꾸기</button>
      </div>

      <div className="review-summary-grid">
        <span><strong>{reviewState?.segments.length ?? 0}</strong> 문장</span>
        <span><strong>{reviewState?.speakerClusters.filter((item) => item.status === "ACTIVE").length ?? 0}</strong> 화자</span>
        <span><strong>{reviewState?.dictionaryTerms.length ?? 0}</strong> 사전</span>
        <span className={blockerCount > 0 ? "review-blocked" : "review-ready"}><strong>{blockerCount}</strong> 결정 차단</span>
      </div>

      <div className="review-panel-grid">
        <details className="review-tool-panel">
          <summary>프로젝트 사전 · 적용 이력</summary>
          <div className="review-tool-body">
            <div className="compact-form-row">
              <label>표준 용어<input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="MeetingLoop" /></label>
              <label>별칭(| 구분)<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="미팅루프|미팅 룹" /></label>
              <button className="button secondary" type="button" disabled={!reviewState || !term.trim()} onClick={() => {
                if (!reviewState) return;
                commit(addDictionaryTerm(reviewState, term, aliases.split("|")), "사전 항목을 브라우저에 저장했습니다.");
                setTerm(""); setAliases("");
              }}>추가</button>
            </div>
            <label>CSV/JSON 가져오기<textarea rows={3} value={dictionaryImport} onChange={(event) => setDictionaryImport(event.target.value)} placeholder={'MeetingLoop,미팅루프|미팅 룹\n또는 [{"term":"MeetingLoop","aliases":["미팅루프"]}]'} /></label>
            <div className="toolbar">
              <button className="button secondary" type="button" disabled={!dictionaryImport.trim()} onClick={handleImport}>가져오기</button>
              <button className="button secondary" type="button" disabled={!reviewState?.dictionaryTerms.length} onClick={() => reviewState && commit(applyDictionary(reviewState), "사전을 전사에 적용하고 변경 이력을 남겼습니다.")}>전체 전사에 적용</button>
            </div>
            <div className="compact-review-list">
              {reviewState?.dictionaryTerms.map((item) => <p key={item.id}><strong>{item.term}</strong><span>{item.aliases.join(", ") || "별칭 없음"}</span><button className="text-button" type="button" onClick={() => reviewState && commit(removeDictionaryTerm(reviewState, item.id), "사전 항목을 삭제했습니다.")}>삭제</button></p>)}
              {suggestions.map((suggestion) => <p key={`${suggestion.alias}:${suggestion.replacement}`}><strong>반복 교정 제안</strong><span>{suggestion.alias} → {suggestion.replacement} · {suggestion.occurrenceCount}회</span><button className="text-button" type="button" onClick={() => reviewState && commit(addDictionaryTerm(reviewState, suggestion.replacement, [suggestion.alias], "REPEATED_CORRECTION"), "반복 교정을 사전에 추가했습니다.")}>사전에 추가</button></p>)}
              <small>적용 {reviewState?.dictionaryApplications.length ?? 0}회 · 편집 이력 {reviewState?.editHistory.length ?? 0}건</small>
            </div>
          </div>
        </details>

        <details className="review-tool-panel">
          <summary>화자 검토 · 병합/분리</summary>
          <div className="review-tool-body compact-review-list">
            {reviewState?.speakerClusters.filter((cluster) => cluster.status === "ACTIVE").map((cluster) => (
              <article key={cluster.id}>
                <p><strong>{cluster.label}</strong><span>신뢰도 {Math.round(cluster.confidence * 100)}% · {cluster.segmentIds.length}구간</span></p>
                <div className="compact-form-row">
                  <select aria-label={`${cluster.label} 참석자`} value={selectedParticipants[cluster.id] ?? ""} onChange={(event) => setSelectedParticipants((value) => ({ ...value, [cluster.id]: event.target.value }))}>
                    <option value="">참석자 선택</option>
                    {props.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}</option>)}
                  </select>
                  <button className="button secondary" type="button" disabled={!selectedParticipants[cluster.id]} onClick={() => {
                    const participant = props.participants.find((item) => item.id === selectedParticipants[cluster.id]);
                    if (reviewState && participant) commit(assignSpeaker(reviewState, cluster.id, participant.id, participant.displayName, "MEETING"), `${cluster.label}을(를) ${participant.displayName}(으)로 확인했습니다.`);
                  }}>회의 전체 배정</button>
                </div>
                <div className="compact-form-row">
                  <select aria-label={`${cluster.label} 병합 대상`} value={mergeSources[cluster.id] ?? ""} onChange={(event) => setMergeSources((value) => ({ ...value, [cluster.id]: event.target.value }))}>
                    <option value="">병합할 화자</option>
                    {reviewState.speakerClusters.filter((item) => item.status === "ACTIVE" && item.id !== cluster.id).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
                  </select>
                  <button className="button secondary" type="button" disabled={!mergeSources[cluster.id]} onClick={() => reviewState && commit(mergeSpeakerClusters(reviewState, cluster.id, mergeSources[cluster.id]!), "화자 클러스터를 병합했습니다.")}>이 화자로 병합</button>
                </div>
              </article>
            ))}
            {props.participants.length === 0 ? <p className="muted">회의에 등록된 참석자가 없어 화자 이름을 직접 편집해 확인할 수 있습니다.</p> : null}
          </div>
        </details>

        <details className="review-tool-panel" open={blockerCount > 0}>
          <summary>추출 항목·근거 검토 {reviewed}/{totalReviews}</summary>
          <div className="review-tool-body compact-review-list">
            {reviewState?.reviewItems.map((item) => (
              <article className={item.blockers.length ? "review-item-blocked" : ""} key={item.id}>
                <p><strong>{reviewTypeLabel(item.type)}</strong><span>{item.status === "PENDING" ? "검토 대기" : item.status === "APPROVED" ? "승인" : "제외"}</span></p>
                <p>{item.content}</p>
                {item.blockers.length > 0 ? <p className="review-blockers">{item.blockers.join(" · ")}</p> : null}
                <label>근거 문장<textarea rows={2} value={evidenceDrafts[item.id] ?? item.evidenceText} onChange={(event) => setEvidenceDrafts((value) => ({ ...value, [item.id]: event.target.value }))} /></label>
                <div className="toolbar">
                  <button className="button secondary" type="button" onClick={() => reviewState && commit(validateEvidence(reviewState, item.id, evidenceDrafts[item.id]), "근거 구간을 확인했습니다.")}>근거 확인</button>
                  <button className="button" type="button" disabled={item.blockers.length > 0 || item.status !== "PENDING"} onClick={() => reviewState && commit(decideReviewItem(reviewState, item.id, "APPROVED"), "검토 항목을 승인했습니다.")}>승인</button>
                  <button className="button danger" type="button" disabled={item.status !== "PENDING"} onClick={() => reviewState && commit(decideReviewItem(reviewState, item.id, "REJECTED"), "검토 항목을 제외했습니다.")}>제외</button>
                </div>
              </article>
            ))}
            {totalReviews === 0 ? <p className="muted">결정·할 일·리스크·미결 질문 후보가 없습니다.</p> : null}
          </div>
        </details>
      </div>

      <div
        className="live-segment-list virtual-transcript-list"
        style={{ maxHeight: REVIEW_VIEWPORT_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {reviewState?.segments.length === 0 ? <p className="muted">전사 문장이 없습니다. 문장을 추가하거나 녹음을 시작해 주세요.</p> : null}
        <div style={{ height: windowState.paddingTop }} aria-hidden="true" />
        {visibleSegments.map((segment, visibleIndex) => {
          const index = windowState.start + visibleIndex;
          const cluster = reviewState?.speakerClusters.find((item) => item.status === "ACTIVE" && item.segmentIds.includes(segment.id));
          return (
            <article className="live-segment transcript-review-segment" key={segment.id}>
              <div className="live-segment-meta">
                <span>{segment.timecode}</span><span>{segment.speaker}</span>
                <span>{segment.speakerStatus === "CONFIRMED" ? "화자 확인" : "화자 미확인"}</span>
                {segment.confidence !== null && segment.confidence < 0.75 ? <span className="risk-badge">낮은 신뢰도 {Math.round(segment.confidence * 100)}%</span> : null}
                {segment.overlapSeverity ? <span className={`risk-badge ${segment.overlapSeverity.toLowerCase()}`}>중첩 {segment.overlapSeverity}</span> : null}
                <button className="icon-button delete-segment-button" type="button" title="문장 삭제" aria-label={`전사 문장 ${index + 1} 삭제`} onClick={() => props.onDelete(segment.id)}>×</button>
              </div>
              <div className="transcript-layer-grid">
                <label>Raw<textarea value={segment.rawText} readOnly rows={2} /></label>
                <label>Normalized<textarea value={segment.normalizedText} readOnly rows={2} /></label>
                <label>Edited<textarea aria-label={`전사 문장 ${index + 1}`} value={segment.editedText} onChange={(event) => {
                  if (!reviewState) return;
                  const firstManualEdit = segment.source === "MANUAL" && segment.rawText === "새 전사 문장을 입력하세요.";
                  commit(patchReviewSegment(reviewState, segment.id, firstManualEdit
                    ? { rawText: event.target.value, normalizedText: event.target.value, editedText: event.target.value }
                    : { editedText: event.target.value }));
                }} rows={2} /></label>
              </div>
              <div className="segment-review-actions">
                <label>화자 이름<input value={segment.speaker} onChange={(event) => reviewState && commit(patchReviewSegment(reviewState, segment.id, { speaker: event.target.value, speakerStatus: "CONFIRMED" }))} /></label>
                <button className="button secondary" type="button" onClick={() => reviewState && commit(reprocessSegment(reviewState, segment.id), "원문을 다시 정규화하고 이력에 기록했습니다.")}>구간 재처리</button>
                <button className="button secondary" type="button" onClick={() => { setRepeatSegmentId(null); props.onPlaySegment(segment.timecode, false); }}>구간 재생</button>
                <button className="button secondary" type="button" aria-pressed={repeatSegmentId === segment.id} onClick={() => { const repeat = repeatSegmentId !== segment.id; setRepeatSegmentId(repeat ? segment.id : null); props.onPlaySegment(segment.timecode, repeat); }}>{repeatSegmentId === segment.id ? "반복 중지" : "반복 재생"}</button>
                <button className="button secondary" type="button" disabled={!cluster || cluster.segmentIds.length < 2} onClick={() => reviewState && cluster && commit(splitSpeakerCluster(reviewState, cluster.id, segment.id), "선택 구간을 새 화자로 분리했습니다.")}>화자 분리</button>
              </div>
              <details className="segment-history"><summary>이 구간 편집 이력 {reviewState?.editHistory.filter((item) => item.segmentId === segment.id).length ?? 0}건</summary>
                {reviewState?.editHistory.filter((item) => item.segmentId === segment.id).slice(-8).reverse().map((item) => <p key={item.id}>{item.source} · {item.field} · {new Date(item.createdAt).toLocaleTimeString("ko-KR")}</p>)}
              </details>
            </article>
          );
        })}
        <div style={{ height: windowState.paddingBottom }} aria-hidden="true" />
      </div>
    </section>
  );
}
