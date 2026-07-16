"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AudioQualityPanel from "./AudioQualityPanel";
import FeedbackDialog from "./FeedbackDialog";
import TranscriptEditor, { type TranscriptEditorSegment, type TranscriptParticipantOption } from "./TranscriptEditor";
import { recordingExtension } from "./browser-recording";
import { MeetingApiClientError, meetingApiRequest } from "./meeting-api-client";
import { useBrowserRecording } from "./useBrowserRecording";

type TranscriptStatus = "draft" | "confirmed";
type AiAnalysisMode = "ollama" | "gemini";
type WorkspaceView = "minutes" | "transcript";

interface LiveTranscriptAlternative {
  transcript: string;
}

interface LiveTranscriptResult {
  isFinal: boolean;
  0?: LiveTranscriptAlternative;
}

interface LiveTranscriptEvent {
  resultIndex: number;
  results: ArrayLike<LiveTranscriptResult>;
}

interface LiveSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: LiveTranscriptEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface LiveTranscriptSegment {
  id: string;
  timecode: string;
  speaker: string;
  rawText: string;
  normalizedText: string;
  text: string;
  status: TranscriptStatus;
  source: "LIVE" | "MANUAL" | "STT";
  confidence: number | null;
  overlapSeverity: "LOW" | "MEDIUM" | "HIGH" | null;
  speakerStatus: "UNCONFIRMED" | "CONFIRMED";
}

interface MinutesDraft {
  version: number;
  updatedAt: string;
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

interface RecordingPanelProps {
  meetingId?: string | undefined;
  organizationId?: string | undefined;
  recordingConsentRecorded?: boolean | undefined;
  initialView?: WorkspaceView | undefined;
  participants?: TranscriptParticipantOption[] | undefined;
}

interface AiProviderState {
  available: boolean;
  mode: "demo" | "real";
  model: string;
  message: string;
  externalTransmission: boolean;
  estimatedCost: string;
  expectedLatency: string;
  qualityProfile: string;
}

interface AiStatus {
  defaultMode: AiAnalysisMode;
  activeProvider: "mock" | AiAnalysisMode;
  mock: AiProviderState;
  ollama: AiProviderState & { serviceReachable: boolean };
  gemini: AiProviderState;
  queue: {
    mode: "inline" | "redis";
    reachable: boolean;
    waiting: number;
    active: number;
    failed: number;
    lag: number;
    message: string;
  };
}

interface FeedbackState {
  title: string;
  message: string;
  tone: "error" | "warning" | "info";
}

interface ApiErrorPayload {
  error?: string;
  message?: string;
  currentVersion?: number;
}

interface ServerTranscript {
  version: number;
  updatedAt: string;
  segments: Array<{
    id: string;
    sequence: number;
    speakerLabel: string;
    startMs: number;
    endMs: number;
    editedText: string;
    source: "LIVE" | "MANUAL" | "STT";
  }>;
}

function apiFailureMessage(payload: ApiErrorPayload | null, fallback: string): string {
  if (payload?.message) return payload.message;
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    INVALID_INPUT: "입력한 내용을 확인한 뒤 다시 시도해 주세요.",
    TRANSCRIPT_REQUIRED: "확정된 전사 TXT가 필요합니다. 최종 전사 확정을 먼저 진행해 주세요.",
    TRANSCRIPT_EDIT_FORBIDDEN: "최종 전사를 수정할 권한이 없습니다.",
    TRANSCRIPT_NOT_FOUND: "서버에 저장된 최종 전사가 없습니다. 전사 문장을 확인한 뒤 최초 확정해 주세요.",
    TRANSCRIPT_VERSION_CONFLICT: "다른 사용자가 먼저 전사를 수정했습니다. 서버 저장본을 다시 불러온 뒤 수정 내용을 다시 반영해 주세요.",
    TRANSCRIPT_REQUEST_TOO_LARGE: "전사 요청 크기가 1MB를 초과했습니다. 문장 수나 문장 길이를 줄여 주세요.",
    TRANSCRIPT_SEGMENT_LIMIT_EXCEEDED: "전사 문장은 한 번에 최대 200개까지 저장할 수 있습니다.",
    TRANSCRIPT_SEGMENT_TEXT_TOO_LONG: "전사 문장 하나는 최대 4,000자까지 입력할 수 있습니다.",
    TRANSCRIPT_SEGMENT_TIME_INVALID: "전사 문장의 종료 시각은 시작 시각보다 빠를 수 없습니다.",
    TRANSCRIPT_SEQUENCE_DUPLICATED: "전사 문장 순서가 중복되었습니다. 서버 저장본을 다시 불러와 주세요.",
    TRANSCRIPT_TEXT_TOO_LARGE: "전체 전사 텍스트가 허용된 크기를 초과했습니다.",
    INVALID_TRANSCRIPT_INPUT: "전사 문장의 화자, 시간 또는 내용을 확인해 주세요.",
    MINUTES_EDIT_FORBIDDEN: "회의록을 생성하거나 수정할 권한이 없습니다.",
    MINUTES_CONFIRM_FORBIDDEN: "회의록을 최종 확정할 권한이 없습니다.",
    MINUTES_NOT_FOUND: "서버에 저장된 최종 회의록이 없습니다.",
    MINUTES_VERSION_CONFLICT: "다른 사용자가 먼저 회의록을 수정했습니다. 저장본을 다시 불러온 뒤 수정 내용을 다시 반영해 주세요.",
    MEETING_NOT_FOUND: "회의 정보를 찾을 수 없습니다. 화면을 새로고침해 주세요.",
    AI_CONFIGURATION_REQUIRED: "AI 설정이 필요합니다. API 키 또는 로컬 AI 설정을 확인해 주세요.",
    AI_PROVIDER_UNAVAILABLE: "AI 제공자에 연결할 수 없습니다. 연결 상태와 설정을 확인해 주세요.",
    AI_MODEL_NOT_FOUND: "설정한 AI 모델을 찾을 수 없습니다. 모델 이름이나 설치 상태를 확인해 주세요.",
    AI_GENERATION_IN_PROGRESS: "이 회의의 AI 보고서를 이미 생성하고 있습니다. 완료될 때까지 기다려 주세요.",
    AI_TIMEOUT: "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    AI_RATE_LIMITED: "AI 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    AI_RESPONSE_INVALID: "AI 응답 형식이 올바르지 않습니다. 다시 생성해 주세요."
  };
  return payload?.error ? (messages[payload.error] ?? fallback) : fallback;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => LiveSpeechRecognition;
    webkitSpeechRecognition?: new () => LiveSpeechRecognition;
  }
}

const initialLiveTranscript: LiveTranscriptSegment[] = [];

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function timecodeToMs(timecode: string): number {
  const [minutes = "0", seconds = "0"] = timecode.split(":");
  return ((Number(minutes) * 60) + Number(seconds)) * 1000;
}

async function requestAiStatus(): Promise<AiStatus> {
  const response = await fetch("/api/ai/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("AI status request failed");
  }
  return response.json() as Promise<AiStatus>;
}

function createMutationIdempotencyKey(scope: "transcript" | "minutes" | "recording-consent" | "external-ai-consent"): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${scope}-${id}`;
}

export default function RecordingPanel({
  meetingId, organizationId, recordingConsentRecorded = false, initialView = "transcript", participants = []
}: RecordingPanelProps) {
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptSegment[]>(initialLiveTranscript);
  const [transcriptMessage, setTranscriptMessage] = useState("실시간 전사 초안은 저장 전까지 자유롭게 수정할 수 있습니다.");
  const [minutesDraft, setMinutesDraft] = useState<MinutesDraft | null>(null);
  const [minutesMessage, setMinutesMessage] = useState("전사 TXT를 저장한 뒤 AI 분석 보고서를 만들 수 있습니다.");
  const [analysisMode, setAnalysisMode] = useState<AiAnalysisMode>("ollama");
  const [recordingConsentConfirmed, setRecordingConsentConfirmed] = useState(recordingConsentRecorded);
  const [geminiConsentConfirmed, setGeminiConsentConfirmed] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(initialView);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiStatusMessage, setAiStatusMessage] = useState("AI 연결 상태를 확인하고 있습니다.");
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [isFinalizingMinutes, setIsFinalizingMinutes] = useState(false);
  const [minutesSavedVersion, setMinutesSavedVersion] = useState<number | null>(null);
  const [minutesUpdatedAt, setMinutesUpdatedAt] = useState<string | null>(null);
  const [isLoadingMinutes, setIsLoadingMinutes] = useState(false);
  const [confirmMinutesReload, setConfirmMinutesReload] = useState(false);
  const [finalRecordMessage, setFinalRecordMessage] = useState("AI 회의록을 수정한 뒤 최종 확정할 수 있습니다.");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [transcriptVersion, setTranscriptVersion] = useState<number | null>(null);
  const [transcriptUpdatedAt, setTranscriptUpdatedAt] = useState<string | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [transcriptServerReady, setTranscriptServerReady] = useState(!meetingId);
  const [confirmServerReload, setConfirmServerReload] = useState(false);
  const [reviewDecisionBlockers, setReviewDecisionBlockers] = useState(0);
  const recognitionRef = useRef<LiveSpeechRecognition | null>(null);
  const recognitionShouldRunRef = useRef(false);
  const liveDraftIdRef = useRef<string | null>(null);
  const minutesPaneRef = useRef<HTMLElement | null>(null);
  const transcriptLoadRequestIdRef = useRef(0);
  const transcriptUserEditedRef = useRef(false);
  const transcriptMutationRef = useRef<{ payload: string; key: string } | null>(null);
  const minutesLoadRequestIdRef = useRef(0);
  const minutesUserEditedRef = useRef(false);
  const minutesMutationRef = useRef<{ payload: string; key: string } | null>(null);
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingRepeatTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!meetingId || !organizationId) return;
    const syncPendingConsent = () => {
      if (!navigator.onLine) return;
      const key = `meetingloop:pending-recording-consent:${meetingId}`;
      const pending = window.localStorage.getItem(key);
      if (!pending) return;
      void fetch(`/api/meetings/${encodeURIComponent(meetingId)}/recording-consent`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: pending
      }).then((response) => {
        if (response.ok) window.localStorage.removeItem(key);
      }).catch(() => undefined);
    };
    syncPendingConsent();
    window.addEventListener("online", syncPendingConsent);
    return () => window.removeEventListener("online", syncPendingConsent);
  }, [meetingId, organizationId]);

  const showFeedback = useCallback((title: string, detail: string, tone: FeedbackState["tone"] = "error") => {
    setFeedback({ title, message: detail, tone });
  }, []);

  const {
    state,
    elapsedSeconds,
    level,
    message,
    networkState,
    storageMode,
    chunkCount,
    storedBytes,
    confirmedChunks: uploadedChunks,
    confirmationState: uploadState,
    confirmationProgress: uploadProgress,
    recordingFileUrl,
    recordingFileName,
    recordingFileSize,
    inputTestState,
    inputTestRemainingMs,
    inputTestReport,
    recordingQualityReport,
    qualityMessage,
    isAnalyzingQuality,
    runInputTest,
    startRecording,
    cancelRecordingRequest,
    pauseRecording,
    resumeRecording,
    stopRecording,
    confirmLocalChunks,
    deleteLocalAudio
  } = useBrowserRecording({
    meetingId,
    onRecordingStart: () => {
      liveDraftIdRef.current = null;
      transcriptUserEditedRef.current = true;
      setLiveTranscript([]);
      setWorkspaceView("transcript");
      setTranscriptMessage("말하는 내용이 전사 초안으로 표시됩니다. 잘못된 문장은 바로 고칠 수 있습니다.");
    },
    onStartRecognition: startLiveRecognition,
    onStopRecognition: stopLiveRecognition,
    onFeedback: showFeedback
  });

  async function startRecordingWithConsent() {
    if (!meetingId || !organizationId) {
      showFeedback("회의 정보가 필요합니다", "회의를 먼저 생성한 뒤 녹음을 시작해 주세요.", "warning");
      return;
    }
    if (!recordingConsentConfirmed) {
      showFeedback("녹음 동의를 확인해 주세요", "참석자에게 녹음 사실과 브라우저 보관 정책을 안내하고 동의를 확인해야 합니다.", "warning");
      return;
    }
    const payload = JSON.stringify({
      organizationId, meetingId, consentConfirmed: true,
      idempotencyKey: createMutationIdempotencyKey("recording-consent"), confirmedAt: new Date().toISOString()
    });
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/recording-consent`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload
      });
      if (!response.ok) throw new Error("RECORDING_CONSENT_SAVE_FAILED");
    } catch {
      if (navigator.onLine) {
        showFeedback("녹음 동의를 기록하지 못했습니다", "서버 연결을 확인한 뒤 다시 시도해 주세요.", "error");
        return;
      }
      window.localStorage.setItem(`meetingloop:pending-recording-consent:${meetingId}`, payload);
    }
    await startRecording();
  }

  const applyServerTranscript = useCallback((transcript: ServerTranscript) => {
    setLiveTranscript(transcript.segments.map((segment) => ({
      id: segment.id,
      timecode: formatElapsed(Math.floor(segment.startMs / 1000)),
      speaker: segment.speakerLabel,
      rawText: segment.editedText,
      normalizedText: segment.editedText,
      text: segment.editedText,
      status: "confirmed",
      source: segment.source,
      confidence: null,
      overlapSeverity: null,
      speakerStatus: "CONFIRMED"
    })));
    setTranscriptVersion(transcript.version);
    setTranscriptUpdatedAt(transcript.updatedAt);
    transcriptUserEditedRef.current = false;
  }, []);

  const loadServerTranscript = useCallback(async (notify: boolean) => {
    if (!meetingId) return;
    const requestId = transcriptLoadRequestIdRef.current + 1;
    transcriptLoadRequestIdRef.current = requestId;
    setIsLoadingTranscript(true);
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/transcript`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ({ transcript?: ServerTranscript | null } & ApiErrorPayload) | null;
      if (requestId !== transcriptLoadRequestIdRef.current) return;
      if (response.ok && payload?.transcript === null) {
        setTranscriptVersion(null);
        setTranscriptUpdatedAt(null);
        setTranscriptMessage("아직 서버에 저장된 최종 전사가 없습니다. 전사를 작성한 뒤 최종 확정해 주세요.");
        if (notify) showFeedback("서버 저장본이 없습니다", "아직 저장된 최종 전사가 없습니다. 전사를 작성한 뒤 최종 확정해 주세요.", "info");
        return;
      }
      if (!response.ok || !payload?.transcript) {
        const detail = apiFailureMessage(payload, "서버 최종 전사를 불러오지 못했습니다.");
        setTranscriptMessage(detail);
        showFeedback("서버 저장본을 불러오지 못했습니다", detail);
        return;
      }
      if (!notify && transcriptUserEditedRef.current) return;
      applyServerTranscript(payload.transcript);
      setTranscriptMessage(`서버에 저장된 최종 전사 v${payload.transcript.version}을 불러왔습니다.`);
      if (notify) showFeedback("서버 저장본을 불러왔습니다", `최종 전사 v${payload.transcript.version}을 화면에 반영했습니다.`, "info");
    } catch {
      if (requestId !== transcriptLoadRequestIdRef.current) return;
      const detail = "서버에 연결할 수 없습니다. 네트워크와 서버 실행 상태를 확인해 주세요.";
      setTranscriptMessage(detail);
      showFeedback("서버 연결 오류", detail);
    } finally {
      if (requestId === transcriptLoadRequestIdRef.current) {
        setIsLoadingTranscript(false);
        setTranscriptServerReady(true);
      }
    }
  }, [applyServerTranscript, meetingId, showFeedback]);

  useEffect(() => {
    void loadServerTranscript(false);
  }, [loadServerTranscript]);

  const loadServerMinutes = useCallback(async (notify: boolean) => {
    if (!meetingId) return;
    const requestId = minutesLoadRequestIdRef.current + 1;
    minutesLoadRequestIdRef.current = requestId;
    setIsLoadingMinutes(true);
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/minutes`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ({ minutes?: MinutesDraft | null } & ApiErrorPayload) | null;
      if (requestId !== minutesLoadRequestIdRef.current) return;
      if (response.ok && payload?.minutes === null) {
        setMinutesSavedVersion(null);
        setMinutesUpdatedAt(null);
        setFinalRecordMessage("아직 서버에 저장된 최종 회의록이 없습니다. 최종 전사를 확정한 뒤 AI 회의록을 생성해 주세요.");
        if (notify) showFeedback("서버 저장본이 없습니다", "저장된 최종 회의록이 없습니다. AI 보고서를 생성한 뒤 확정해 주세요.", "info");
        return;
      }
      if (!response.ok || !payload?.minutes) {
        const detail = apiFailureMessage(payload, "서버의 최종 회의록을 불러오지 못했습니다.");
        setFinalRecordMessage(detail);
        showFeedback("회의록을 불러오지 못했습니다", detail);
        return;
      }
      if (!notify && minutesUserEditedRef.current) return;
      setMinutesDraft(payload.minutes);
      setMinutesSavedVersion(payload.minutes.version);
      setMinutesUpdatedAt(payload.minutes.updatedAt);
      minutesUserEditedRef.current = false;
      setFinalRecordMessage(`서버에 저장된 최종 회의록 v${payload.minutes.version}을 불러왔습니다.`);
      if (notify) showFeedback("회의록 저장본을 불러왔습니다", `최종 회의록 v${payload.minutes.version}을 화면에 반영했습니다.`, "info");
    } catch {
      if (requestId !== minutesLoadRequestIdRef.current) return;
      const detail = "서버에 연결할 수 없습니다. 네트워크와 서버 실행 상태를 확인해 주세요.";
      setFinalRecordMessage(detail);
      showFeedback("서버 연결 오류", detail);
    } finally {
      if (requestId === minutesLoadRequestIdRef.current) setIsLoadingMinutes(false);
    }
  }, [meetingId, showFeedback]);

  useEffect(() => {
    void loadServerMinutes(false);
  }, [loadServerMinutes]);

  useEffect(() => {
    let active = true;
    requestAiStatus()
      .then((status) => {
        if (!active) {
          return;
        }
        setAiStatus(status);
        setAnalysisMode(status.defaultMode);
        setAiStatusMessage("AI 연결 상태를 확인했습니다.");
      })
      .catch(() => {
        if (active) {
          setAiStatusMessage("AI 연결 상태를 확인하지 못했습니다.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    recognitionShouldRunRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  function upsertLiveDraft(text: string, isFinal: boolean) {
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    const existingId = liveDraftIdRef.current;
    const nextId = existingId ?? `segment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    liveDraftIdRef.current = isFinal ? null : nextId;
    transcriptUserEditedRef.current = true;
    setLiveTranscript((segments) => {
      const withoutIntro = segments.filter((segment) => segment.id !== "intro");
      const existing = withoutIntro.find((segment) => segment.id === nextId);
      if (existing) {
        return withoutIntro.map((segment) => (
          segment.id === nextId
            ? { ...segment, rawText: cleanText, normalizedText: cleanText, text: cleanText, status: "draft" }
            : segment
        ));
      }
      return [...withoutIntro, {
        id: nextId,
        timecode: formatElapsed(elapsedSeconds),
        speaker: "화자 A",
        rawText: cleanText,
        normalizedText: cleanText,
        text: cleanText,
        status: "draft",
        source: "LIVE",
        confidence: 0.72,
        overlapSeverity: null,
        speakerStatus: "UNCONFIRMED"
      }];
    });
  }

  function startLiveRecognition() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      const detail = "이 브라우저는 실시간 음성 인식을 지원하지 않습니다. 녹음 후 STT 분석 또는 수동 문장 추가로 정리할 수 있습니다.";
      setTranscriptMessage(detail);
      showFeedback("실시간 음성 인식을 사용할 수 없습니다", detail, "warning");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ko-KR";
    recognition.onresult = (event) => {
      let text = "";
      let isFinal = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (alternative?.transcript) {
          text += alternative.transcript;
          isFinal = isFinal || result?.isFinal === true;
        }
      }
      upsertLiveDraft(text, isFinal);
      setTranscriptMessage(isFinal ? "확정된 전사 문장을 저장했습니다. 필요하면 바로 수정하세요." : "말하는 내용을 실시간 전사 초안으로 받고 있습니다.");
    };
    recognition.onerror = () => {
      const detail = "실시간 전사 중 오류가 발생했습니다. 녹음 파일은 계속 저장되며, 문장은 직접 추가할 수 있습니다.";
      setTranscriptMessage(detail);
      showFeedback("실시간 전사를 계속할 수 없습니다", detail, "warning");
    };
    recognition.onend = () => {
      if (recognitionShouldRunRef.current) {
        try {
          recognition.start();
        } catch {
          recognitionShouldRunRef.current = false;
          setTranscriptMessage("실시간 음성 인식을 다시 시작하지 못했습니다. 녹음 파일은 계속 저장되며 문장은 직접 추가할 수 있습니다.");
        }
      }
    };
    recognitionRef.current = recognition;
    recognitionShouldRunRef.current = true;
    try {
      recognition.start();
    } catch {
      recognitionShouldRunRef.current = false;
      recognitionRef.current = null;
      setTranscriptMessage("실시간 음성 인식을 시작하지 못했습니다. 녹음 파일은 계속 저장되며 문장은 직접 추가할 수 있습니다.");
    }
  }

  function stopLiveRecognition() {
    recognitionShouldRunRef.current = false;
    recognitionRef.current?.stop();
  }

  function addManualTranscriptSegment() {
    transcriptUserEditedRef.current = true;
    setLiveTranscript((segments) => [...segments.filter((segment) => segment.id !== "intro"), {
      id: `segment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timecode: formatElapsed(elapsedSeconds),
      speaker: "화자 A",
      rawText: "새 전사 문장을 입력하세요.",
      normalizedText: "새 전사 문장을 입력하세요.",
      text: "새 전사 문장을 입력하세요.",
      status: "draft",
      source: "MANUAL",
      confidence: 0.99,
      overlapSeverity: null,
      speakerStatus: "UNCONFIRMED"
    }]);
    setTranscriptMessage("새 문장을 추가했습니다. 내용을 수정한 뒤 저장하세요.");
  }

  const updateReviewSegments = useCallback((segments: TranscriptEditorSegment[]) => {
    transcriptUserEditedRef.current = true;
    setLiveTranscript(segments.map((segment) => ({ ...segment, status: "draft" })));
  }, []);

  function deleteTranscriptSegment(id: string) {
    transcriptUserEditedRef.current = true;
    setLiveTranscript((segments) => segments.filter((segment) => segment.id !== id));
    setTranscriptMessage("선택한 전사 문장을 삭제했습니다.");
  }

  async function saveTranscriptDraft() {
    const segmentsToSave = liveTranscript
      .filter((segment) => segment.id !== "intro" && segment.text.trim().length > 0)
      .map((segment, sequence) => {
        const startMs = timecodeToMs(segment.timecode);
        return {
          sequence,
          speakerLabel: segment.speaker,
          startMs,
          endMs: startMs + 5000,
          editedText: segment.text.trim(),
          source: segment.source
        };
      });

    if (!meetingId) {
      const detail = "회의를 먼저 생성하면 전사 문장을 DB에 저장할 수 있습니다. 현재 내용은 화면 초안으로만 남아 있습니다.";
      setTranscriptMessage(detail);
      showFeedback("회의 정보가 필요합니다", detail, "warning");
      return;
    }

    if (segmentsToSave.length === 0) {
      const detail = "저장할 전사 문장이 없습니다. 문장을 추가하거나 실시간 전사를 받은 뒤 저장해 주세요.";
      setTranscriptMessage(detail);
      showFeedback("전사 문장을 확인해 주세요", detail, "warning");
      return;
    }

    try {
      const requestBody = JSON.stringify({ version: transcriptVersion ?? 0, segments: segmentsToSave });
      if (transcriptMutationRef.current?.payload !== requestBody) {
        transcriptMutationRef.current = { payload: requestBody, key: createMutationIdempotencyKey("transcript") };
      }
      const payload = await meetingApiRequest<{ transcript: ServerTranscript }>(`/api/meetings/${encodeURIComponent(meetingId)}/transcript`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": transcriptMutationRef.current.key
        },
        body: requestBody
      }, { retryCount: 1 });
      transcriptMutationRef.current = null;
      applyServerTranscript(payload.transcript);
      const detail = `최종 전사 ${segmentsToSave.length}개 문장을 v${payload.transcript.version}으로 서버에 확정 저장했습니다.`;
      setTranscriptMessage(detail);
      showFeedback("최종 전사 저장 완료", detail, "info");
    } catch (error) {
      if (error instanceof MeetingApiClientError) {
        if (error.status > 0 && error.status < 500) transcriptMutationRef.current = null;
        const detail = apiFailureMessage(error.payload, error.status === 0
          ? "네트워크 연결 후 같은 요청을 다시 시도해 주세요."
          : "최종 전사 확정에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        setTranscriptMessage(detail);
        showFeedback(error.status === 409 ? "다른 수정 내용이 먼저 저장되었습니다" : error.status === 0 ? "오프라인 또는 연결 오류" : "최종 전사를 저장하지 못했습니다", detail,
          error.status === 409 || error.status === 0 ? "warning" : "error");
        return;
      }
      const detail = "서버에 연결할 수 없습니다. 네트워크와 서버 실행 상태를 확인해 주세요.";
      setTranscriptMessage(detail);
      showFeedback("서버 연결 오류", detail);
    }
  }

  async function downloadTranscript() {
    if (!meetingId || transcriptVersion === null) {
      showFeedback("다운로드할 전사가 없습니다", "최종 전사를 먼저 서버에 확정 저장해 주세요.", "warning");
      return;
    }
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/transcript.txt`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
        showFeedback("전사 TXT를 다운로드하지 못했습니다", apiFailureMessage(payload, "서버 저장본을 확인해 주세요."));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${meetingId}-transcript-v${transcriptVersion}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      showFeedback("전사 TXT 다운로드 오류", "서버에 연결할 수 없습니다. 네트워크와 서버 상태를 확인해 주세요.");
    }
  }

  function requestServerReload() {
    if (transcriptUserEditedRef.current) {
      setConfirmServerReload(true);
      return;
    }
    void loadServerTranscript(true);
  }

  async function generateMinutesDraft() {
    if (!meetingId) {
      const detail = "회의를 먼저 생성하고 전사 TXT를 저장한 뒤 AI 분석 보고서를 만들 수 있습니다.";
      setMinutesMessage(detail);
      showFeedback("회의 정보가 필요합니다", detail, "warning");
      return;
    }
    if (analysisMode === "gemini" && !geminiConsentConfirmed) {
      const detail = "확정 전사 TXT가 Google Gemini API로 전송된다는 안내를 확인하고 동의해 주세요.";
      setMinutesMessage(detail);
      showFeedback("외부 AI 전송 동의가 필요합니다", detail, "warning");
      return;
    }

    setIsGeneratingMinutes(true);
    setMinutesMessage(analysisMode === "ollama"
      ? "로컬 AI가 저장된 전사 TXT를 분석하고 있습니다."
      : "Gemini가 저장된 전사 TXT를 분석하고 있습니다.");
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/minutes/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: analysisMode,
          ...(analysisMode === "gemini" ? {
            externalAiConsent: true,
            consentId: createMutationIdempotencyKey("external-ai-consent")
          } : {})
        })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as ApiErrorPayload | null;
        const detail = apiFailureMessage(errorPayload, "AI 분석 보고서 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        setMinutesMessage(detail);
        showFeedback(errorPayload?.error === "TRANSCRIPT_REQUIRED" ? "최종 전사가 필요합니다" : "AI 보고서를 생성하지 못했습니다", detail,
          response.status === 409 ? "warning" : "error");
        return;
      }

      type GenerationResponse = {
        status: "GENERATED" | "QUEUED" | "PROCESSING" | "FAILED";
        minutes?: MinutesDraft;
        provider?: { kind: "mock" | AiAnalysisMode; model: string };
        job?: { id: string };
      };
      let payload = await response.json() as GenerationResponse;
      if (payload.status === "QUEUED" && payload.job?.id) {
        setMinutesMessage("분석 작업을 Queue에 등록했습니다. worker 처리 결과를 기다리고 있습니다.");
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
          const statusResponse = await fetch(
            `/api/meetings/${encodeURIComponent(meetingId)}/minutes/generate?jobId=${encodeURIComponent(payload.job.id)}`,
            { cache: "no-store" }
          );
          const statusPayload = await statusResponse.json().catch(() => null) as (GenerationResponse & ApiErrorPayload) | null;
          if (!statusResponse.ok || statusPayload?.status === "FAILED") {
            const detail = apiFailureMessage(statusPayload, "worker가 AI 분석 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
            setMinutesMessage(detail);
            showFeedback("AI 분석 작업 실패", detail, "error");
            return;
          }
          if (statusPayload?.status === "GENERATED" && statusPayload.minutes) {
            payload = statusPayload;
            break;
          }
        }
        if (!payload.minutes || !payload.provider) {
          const detail = "AI 분석 대기 시간이 초과되었습니다. Queue 상태를 확인한 뒤 다시 시도해 주세요.";
          setMinutesMessage(detail);
          showFeedback("AI 분석 대기 시간 초과", detail, "warning");
          return;
        }
      }
      if (!payload.minutes || !payload.provider) throw new Error("AI_RESPONSE_INVALID");
      minutesUserEditedRef.current = true;
      setMinutesDraft({ ...payload.minutes, version: minutesSavedVersion ?? 0 });
      setWorkspaceView("minutes");
      window.requestAnimationFrame(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.requestAnimationFrame(() => {
          minutesPaneRef.current?.scrollTo({ top: 0 });
        });
      });
      const providerLabel = payload.provider.kind === "gemini"
        ? "Gemini"
        : payload.provider.kind === "ollama"
          ? "로컬 AI"
          : "테스트 분석기";
      setMinutesMessage(`${providerLabel} (${payload.provider.model})가 전사 TXT를 분석해 보고서를 생성했습니다.`);
    } catch {
      const detail = "AI 분석 서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
      setMinutesMessage(detail);
      showFeedback("AI 연결 오류", detail);
    } finally {
      setIsGeneratingMinutes(false);
    }
  }

  async function refreshAiStatus() {
    setAiStatusMessage("AI 연결 상태를 다시 확인하고 있습니다.");
    try {
      const status = await requestAiStatus();
      setAiStatus(status);
      setAiStatusMessage("AI 연결 상태를 확인했습니다.");
    } catch {
      const detail = "AI 연결 상태를 확인하지 못했습니다. Ollama 또는 Gemini 설정을 확인해 주세요.";
      setAiStatusMessage(detail);
      showFeedback("AI 상태 확인 실패", detail, "warning");
    }
  }

  function updateMinutesDraft<K extends keyof MinutesDraft>(key: K, value: MinutesDraft[K]) {
    minutesUserEditedRef.current = true;
    setMinutesDraft((draft) => draft ? { ...draft, [key]: value } : draft);
  }

  function requestMinutesReload() {
    if (minutesUserEditedRef.current) {
      setConfirmMinutesReload(true);
      return;
    }
    void loadServerMinutes(true);
  }

  function splitLines(value: string): string[] {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  async function finalizeMinutesDraft() {
    if (!meetingId || !minutesDraft) {
      const detail = "AI 회의록을 먼저 생성한 뒤 최종 확정할 수 있습니다.";
      setFinalRecordMessage(detail);
      showFeedback("확정할 회의록이 없습니다", detail, "warning");
      return;
    }

    if (reviewDecisionBlockers > 0) {
      const detail = `결정 후보 ${reviewDecisionBlockers}건의 화자 또는 근거 검토가 끝나지 않았습니다. 전사 화면의 추출 항목·근거 검토에서 확인해 주세요.`;
      setFinalRecordMessage(detail);
      setWorkspaceView("transcript");
      showFeedback("중요 결정 검토가 필요합니다", detail, "warning");
      return;
    }

    setIsFinalizingMinutes(true);
    setFinalRecordMessage("수정한 회의록을 최종 확정하여 서버에 저장합니다.");
    try {
      const requestBody = JSON.stringify({
        ...minutesDraft,
        version: minutesSavedVersion ?? 0
      });
      if (minutesMutationRef.current?.payload !== requestBody) {
        minutesMutationRef.current = { payload: requestBody, key: createMutationIdempotencyKey("minutes") };
      }
      const payload = await meetingApiRequest<{ minutes: MinutesDraft }>(`/api/meetings/${encodeURIComponent(meetingId)}/minutes`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": minutesMutationRef.current.key
        },
        body: requestBody
      }, { retryCount: 1 });
      minutesMutationRef.current = null;
      setMinutesDraft(payload.minutes);
      setMinutesSavedVersion(payload.minutes.version);
      setMinutesUpdatedAt(payload.minutes.updatedAt);
      minutesUserEditedRef.current = false;
      const detail = `회의록을 v${payload.minutes.version}으로 최종 확정했습니다. 서버에는 최종 전사 TXT와 확정 회의록만 저장됩니다.`;
      setFinalRecordMessage(detail);
      showFeedback("회의록 저장 완료", detail, "info");
    } catch (error) {
      if (error instanceof MeetingApiClientError) {
        if (error.status > 0 && error.status < 500) minutesMutationRef.current = null;
        const detail = apiFailureMessage(error.payload, error.status === 0
          ? "네트워크 연결 후 같은 요청을 다시 시도해 주세요."
          : "회의록을 최종 확정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setFinalRecordMessage(detail);
        showFeedback(error.status === 409 ? "다른 수정 내용이 먼저 저장되었습니다" : error.status === 0 ? "오프라인 또는 연결 오류" : "회의록을 저장하지 못했습니다", detail,
          error.status === 409 || error.status === 0 ? "warning" : "error");
        return;
      }
      const detail = "서버에 연결할 수 없어 회의록을 저장하지 못했습니다. 서버 상태를 확인해 주세요.";
      setFinalRecordMessage(detail);
      showFeedback("서버 연결 오류", detail);
    } finally {
      setIsFinalizingMinutes(false);
    }
  }

  const canStart = state === "idle" || state === "stopped" || state === "error";
  const canPause = state === "recording";
  const canResume = state === "paused";
  const canStop = state === "recording" || state === "paused";
  const visibleTranscript = liveTranscript;

  const playTranscriptSegment = useCallback((timecode: string, repeat: boolean) => {
    const audio = recordingAudioRef.current;
    if (!audio) {
      showFeedback("재생할 녹음이 없습니다", "이 브라우저에서 녹음을 완료한 뒤 구간 재생을 사용할 수 있습니다.", "warning");
      return;
    }
    if (recordingRepeatTimerRef.current !== null) {
      window.clearTimeout(recordingRepeatTimerRef.current);
      recordingRepeatTimerRef.current = null;
    }
    const start = timecodeToMs(timecode) / 1000;
    const play = () => {
      audio.currentTime = Math.min(start, Number.isFinite(audio.duration) ? audio.duration : start);
      void audio.play();
      recordingRepeatTimerRef.current = window.setTimeout(() => {
        audio.pause();
        if (repeat) play();
      }, 5000);
    };
    play();
  }, [showFeedback]);

  useEffect(() => () => {
    if (recordingRepeatTimerRef.current !== null) window.clearTimeout(recordingRepeatTimerRef.current);
  }, []);
  const selectedAiStatus = aiStatus
    ? aiStatus.activeProvider === "mock" ? aiStatus.mock : aiStatus[analysisMode]
    : null;
  const analysisAvailable = selectedAiStatus?.available === true;
  const recordingStatus = state === "requesting"
    ? "마이크 권한 확인 중"
    : state === "recording"
      ? "녹음 중"
      : state === "paused"
        ? "일시 중지"
        : state === "stopped"
          ? "녹음 종료"
          : state === "error"
            ? "확인 필요"
            : "녹음 대기";

  return (
    <>
      <FeedbackDialog
        open={feedback !== null}
        title={feedback?.title ?? ""}
        message={feedback?.message ?? ""}
        tone={feedback?.tone ?? "error"}
        onClose={() => setFeedback(null)}
      />
      <FeedbackDialog
        open={confirmServerReload}
        title="서버 저장본으로 다시 불러올까요?"
        message="화면에서 수정 중인 내용은 사라지고 서버에 마지막으로 저장된 최종 전사로 바뀝니다."
        tone="warning"
        confirmLabel="서버 저장본 불러오기"
        cancelLabel="취소"
        onClose={() => setConfirmServerReload(false)}
        onConfirm={() => {
          setConfirmServerReload(false);
          void loadServerTranscript(true);
        }}
      />
      <FeedbackDialog
        open={confirmMinutesReload}
        title="저장된 회의록을 다시 불러올까요?"
        message="화면에서 생성하거나 수정 중인 회의록은 사라지고 서버에 마지막으로 저장된 최종 회의록으로 바뀝니다."
        tone="warning"
        confirmLabel="저장본 불러오기"
        cancelLabel="취소"
        onClose={() => setConfirmMinutesReload(false)}
        onConfirm={() => {
          setConfirmMinutesReload(false);
          void loadServerMinutes(true);
        }}
      />
      <section className="recorder-panel" aria-label="브라우저 녹음">
      <div className="recorder-status">
        <div className="recorder-status-label">
          <strong>{recordingStatus}</strong>
          <span className={`network-status ${networkState}`} role="status">
            <span aria-hidden="true" />{networkState === "online" ? "온라인" : "오프라인 · 로컬 저장"}
          </span>
        </div>
        <span>{formatElapsed(elapsedSeconds)}</span>
      </div>
      <AudioQualityPanel
        level={level}
        inputTestState={inputTestState}
        inputTestRemainingMs={inputTestRemainingMs}
        inputTestReport={inputTestReport}
        recordingQualityReport={recordingQualityReport}
        qualityMessage={qualityMessage}
        isAnalyzingQuality={isAnalyzingQuality}
        disabled={state === "requesting" || state === "recording" || state === "paused"}
        onRunInputTest={() => void runInputTest()}
      />
      <label className="check-row recording-consent-check">
        <input
          type="checkbox"
          aria-label="녹음 및 브라우저 보관 동의"
          checked={recordingConsentConfirmed}
          onChange={(event) => setRecordingConsentConfirmed(event.target.checked)}
          disabled={!canStart}
        />
        <span>참석자에게 녹음 사실을 알렸으며, 원본 음성이 서버가 아닌 이 브라우저에만 보관되는 것에 동의했습니다.</span>
      </label>
      <div className="toolbar recording-controls" aria-label="브라우저 녹음 제어">
        <button className="button" type="button" onClick={() => void startRecordingWithConsent()} disabled={!canStart}>
          {state === "requesting" ? "권한 확인 중" : "녹음 시작"}
        </button>
        <button className="button secondary" type="button" onClick={pauseRecording} disabled={!canPause}>일시 중지</button>
        <button className="button secondary" type="button" onClick={resumeRecording} disabled={!canResume}>재개</button>
        <button className="button danger" type="button" onClick={stopRecording} disabled={!canStop}>종료</button>
      </div>
      {state === "requesting" ? (
        <div className="permission-notice" role="status" aria-live="polite">
          <span>브라우저의 마이크 권한 창에서 <strong>허용</strong>을 눌러주세요.</span>
          <button className="button secondary" type="button" onClick={cancelRecordingRequest}>권한 요청 취소</button>
        </div>
      ) : null}
      {recordingFileUrl ? (
        <div className="recording-result" aria-label="완료된 녹음">
          <audio ref={recordingAudioRef} aria-label="녹음 재생 확인" controls preload="metadata" src={recordingFileUrl} />
          <div className="recording-result-actions">
            <a className="button secondary download-link" href={recordingFileUrl} download={recordingFileName}>녹음 파일 저장</a>
            <span className="muted">{recordingExtension(recordingFileName).toUpperCase()} · {(recordingFileSize / 1024).toFixed(1)}KB</span>
          </div>
        </div>
      ) : null}
      <p className="muted recording-message">{message}</p>
      <details className="storage-details">
        <summary>
          <span>로컬 음성 관리</span>
          <small>{chunkCount}개 청크 · {storedBytes.toLocaleString("ko-KR")} bytes</small>
        </summary>
        <div className="storage-details-body">
          <div className="local-audio-row">
            <div className="upload-meter" aria-label={`업로드 진행률 ${uploadProgress}%`}>
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
            <div className="toolbar">
              <button className="button secondary" type="button" onClick={() => void confirmLocalChunks()} disabled={uploadState === "confirming"}>
                {uploadState === "failed" ? "로컬 보관 재확인" : "로컬 음성 보관 확인"}
              </button>
              <button className="button danger" type="button" aria-label="로컬 원본 음성 삭제" onClick={() => void deleteLocalAudio()} disabled={state === "recording" || state === "paused"}>
                원본 삭제
              </button>
            </div>
          </div>
          <div className="recorder-facts">
            <span>임시 청크 {chunkCount}개</span>
            <span>로컬 확인 {uploadedChunks}개</span>
            <span>진행률 {uploadProgress}%</span>
            <span>{storageMode === "memory"
              ? "메모리 fallback · 즉시 파일 저장 필요"
              : uploadState === "complete" ? "로컬 보관 확인" : uploadState === "failed" ? "재확인 대기" : "IndexedDB 로컬 보관"}</span>
          </div>
        </div>
      </details>
      <div className="workspace-tabs segmented-control" role="tablist" aria-label="회의록 작업 화면">
        <button
          type="button"
          role="tab"
          aria-selected={workspaceView === "transcript"}
          onClick={() => setWorkspaceView("transcript")}
        >
          실시간 TXT
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceView === "minutes"}
          onClick={() => setWorkspaceView("minutes")}
        >
          회의록·보고서
        </button>
      </div>
      <div className="recording-workspace-grid">
        <section
          ref={minutesPaneRef}
          className="minutes-draft workspace-pane"
          data-mobile-active={workspaceView === "minutes"}
          aria-label="AI 분석 보고서"
        >
          <div className="editor-heading pane-heading">
            <div>
              <strong>회의록 및 AI 보고서</strong>
              <p className="muted">{minutesMessage}</p>
              <p className="transcript-save-meta">
                {isLoadingMinutes
                  ? "회의록 저장본 확인 중"
                  : minutesSavedVersion !== null && minutesUpdatedAt
                    ? `서버 v${minutesSavedVersion} · 최종 수정 ${formatUpdatedAt(minutesUpdatedAt)}`
                    : "서버 저장 전 · AI 생성 초안"}
              </p>
            </div>
            <div className="toolbar">
              <button className="button secondary" type="button" onClick={requestMinutesReload} disabled={isLoadingMinutes}>
                저장된 회의록 불러오기
              </button>
              <button className="button ai-generate-button" type="button" onClick={generateMinutesDraft} disabled={isGeneratingMinutes || !analysisAvailable}>
                {isGeneratingMinutes ? "AI 분석 중" : "AI 보고서 생성"}
              </button>
            </div>
          </div>
          <div className="ai-provider-bar">
            <div className="segmented-control" role="group" aria-label="AI 분석 방식">
              <button
                type="button"
                aria-pressed={analysisMode === "ollama"}
                onClick={() => setAnalysisMode("ollama")}
              >
                로컬 무료 AI
              </button>
              <button
                type="button"
                aria-pressed={analysisMode === "gemini"}
                onClick={() => setAnalysisMode("gemini")}
              >
                Gemini 무료
              </button>
            </div>
            <button className="text-button" type="button" onClick={refreshAiStatus}>연결 다시 확인</button>
          </div>
          {analysisMode === "gemini" ? (
            <label className="check-row external-ai-consent-check">
              <input
                type="checkbox"
                aria-label="Gemini 외부 전송 동의"
                checked={geminiConsentConfirmed}
                onChange={(event) => setGeminiConsentConfirmed(event.target.checked)}
              />
              <span>분석할 최종 전사 TXT가 Google Gemini API로 전송됩니다. 원본 음성은 전송되지 않으며, AI 생성 초안은 최종 확정 전 서버 DB에 저장되지 않습니다.</span>
            </label>
          ) : null}
          <div className={`ai-provider-status ${analysisAvailable ? "ready" : "unavailable"}`} role="status">
            <strong>{aiStatus?.activeProvider === "mock" ? "데모 분석" : analysisMode === "ollama" ? "로컬 AI" : "Gemini"}</strong>
            <span>{selectedAiStatus ? `${selectedAiStatus.model} · ${selectedAiStatus.message}` : aiStatusMessage}</span>
            {selectedAiStatus ? (
              <span>{selectedAiStatus.externalTransmission
                ? "분석할 최종 전사 TXT가 외부 AI API로 전송됩니다. 원본 음성은 전송되지 않습니다."
                : "원본 음성과 최종 전사 TXT는 외부 AI로 전송되지 않습니다."}</span>
            ) : null}
            {selectedAiStatus ? <span>예상 비용 {selectedAiStatus.estimatedCost} · 지연 {selectedAiStatus.expectedLatency} · {selectedAiStatus.qualityProfile}</span> : null}
            {aiStatus ? <span>분석 실행 {aiStatus.queue.mode === "redis" ? "Redis Queue + worker" : "inline"} · 대기 {aiStatus.queue.lag} · 실패 {aiStatus.queue.failed} · {aiStatus.queue.message}</span> : null}
          </div>
          {minutesDraft ? (
            <div className="minutes-body">
              <label className="minutes-field full-width">
                제목
                <input value={minutesDraft.title} onChange={(event) => updateMinutesDraft("title", event.target.value)} />
              </label>
              <label className="minutes-field full-width">
                요약
                <textarea value={minutesDraft.summary} onChange={(event) => updateMinutesDraft("summary", event.target.value)} rows={3} />
              </label>
              <label className="minutes-field">
                요약 보고서
                <textarea value={minutesDraft.keyPoints.join("\n")} onChange={(event) => updateMinutesDraft("keyPoints", splitLines(event.target.value))} rows={4} />
              </label>
              <label className="minutes-field">
                주요 논의
                <textarea value={minutesDraft.discussionTopics.join("\n")} onChange={(event) => updateMinutesDraft("discussionTopics", splitLines(event.target.value))} rows={4} />
              </label>
              <label className="minutes-field">
                결정
                <textarea value={minutesDraft.decisions.join("\n")} onChange={(event) => updateMinutesDraft("decisions", splitLines(event.target.value))} rows={3} />
              </label>
              <label className="minutes-field">
                할 일
                <textarea
                  value={minutesDraft.actionItems.map((item) => item.content).join("\n")}
                  onChange={(event) => updateMinutesDraft("actionItems", splitLines(event.target.value).map((content, index) => ({
                    id: minutesDraft.actionItems[index]?.id ?? `action-${index + 1}`,
                    content,
                    assignee: minutesDraft.actionItems[index]?.assignee ?? null,
                    dueDate: minutesDraft.actionItems[index]?.dueDate ?? null,
                    evidenceSegmentSequence: minutesDraft.actionItems[index]?.evidenceSegmentSequence ?? 0
                  })))}
                  rows={3}
                />
              </label>
              <label className="minutes-field">
                리스크
                <textarea value={minutesDraft.risks.join("\n")} onChange={(event) => updateMinutesDraft("risks", splitLines(event.target.value))} rows={3} />
              </label>
              <label className="minutes-field">
                미결 질문
                <textarea value={minutesDraft.openQuestions.join("\n")} onChange={(event) => updateMinutesDraft("openQuestions", splitLines(event.target.value))} rows={3} />
              </label>
              <div className="minutes-footer full-width">
                <button className="button" type="button" onClick={finalizeMinutesDraft} disabled={isFinalizingMinutes}>
                  회의록 최종 확정
                </button>
                <p className="muted">{finalRecordMessage}</p>
              </div>
            </div>
          ) : null}
        </section>
        <TranscriptEditor
          active={workspaceView === "transcript"}
          meetingId={meetingId}
          transcriptVersion={transcriptVersion}
          serverReady={transcriptServerReady}
          participants={participants}
          segments={visibleTranscript}
          message={transcriptMessage}
          saveMeta={isLoadingTranscript
            ? "서버 저장본 확인 중"
            : transcriptVersion !== null && transcriptUpdatedAt
              ? `서버 v${transcriptVersion} · 최종 수정 ${formatUpdatedAt(transcriptUpdatedAt)}`
              : "서버 저장 전 · 로컬 임시 전사"}
          isLoading={isLoadingTranscript}
          canDownload={transcriptVersion !== null}
          onAdd={addManualTranscriptSegment}
          onReload={requestServerReload}
          onDownload={downloadTranscript}
          onSave={() => void saveTranscriptDraft()}
          onDelete={deleteTranscriptSegment}
          onSegmentsChange={updateReviewSegments}
          onPlaySegment={playTranscriptSegment}
          onReviewGateChange={setReviewDecisionBlockers}
        />
      </div>
      </section>
    </>
  );
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}
