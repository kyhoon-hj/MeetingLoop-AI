"use client";

import { useEffect, useRef, useState } from "react";

type RecordingState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "error";
type UploadState = "idle" | "uploading" | "failed" | "complete";
type TranscriptStatus = "draft" | "saved";
type AiAnalysisMode = "ollama" | "gemini";
type WorkspaceView = "minutes" | "transcript";

interface StoredChunkMeta {
  id: string;
  size: number;
  type: string;
  createdAt: string;
}

interface StoredChunkRecord extends StoredChunkMeta {
  blob: Blob;
  uploadStatus: "PENDING" | "UPLOADED" | "FAILED";
}

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
  text: string;
  status: TranscriptStatus;
}

interface MinutesDraft {
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
}

interface AiProviderState {
  available: boolean;
  model: string;
  message: string;
}

interface AiStatus {
  defaultMode: AiAnalysisMode;
  activeProvider: "mock" | AiAnalysisMode;
  ollama: AiProviderState & { serviceReachable: boolean };
  gemini: AiProviderState;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => LiveSpeechRecognition;
    webkitSpeechRecognition?: new () => LiveSpeechRecognition;
  }
}

const databaseName = "meetingloop-recordings";
const storeName = "chunks";
const microphoneRequestTimeoutMs = 30_000;
const initialLiveTranscript: LiveTranscriptSegment[] = [
  {
    id: "intro",
    timecode: "00:00",
    speaker: "화자 A",
    rawText: "녹음을 시작하면 이 영역에 실시간 전사 초안이 표시됩니다. 잘못 인식된 문장은 바로 수정하거나 삭제할 수 있습니다.",
    text: "녹음을 시작하면 이 영역에 실시간 전사 초안이 표시됩니다. 잘못 인식된 문장은 바로 수정하거나 삭제할 수 있습니다.",
    status: "draft"
  }
];

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function timecodeToMs(timecode: string): number {
  const [minutes = "0", seconds = "0"] = timecode.split(":");
  return ((Number(minutes) * 60) + Number(seconds)) * 1000;
}

function requestMicrophoneStream(): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      settled = true;
      reject(new DOMException("Microphone permission request timed out", "TimeoutError"));
    }, microphoneRequestTimeoutMs);

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (settled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve(stream);
    }).catch((error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}

function microphoneErrorMessage(error: unknown): string {
  const errorName = error instanceof DOMException ? error.name : "";

  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    return "마이크 권한이 차단되었습니다. 주소창의 마이크 아이콘에서 권한을 허용한 뒤 다시 눌러주세요.";
  }
  if (errorName === "NotFoundError") {
    return "사용할 수 있는 마이크를 찾지 못했습니다. 마이크 연결 상태를 확인해 주세요.";
  }
  if (errorName === "NotReadableError" || errorName === "AbortError") {
    return "다른 앱이 마이크를 사용 중입니다. 해당 앱을 닫은 뒤 다시 시도해 주세요.";
  }
  if (errorName === "TimeoutError") {
    return "마이크 권한 확인 시간이 초과되었습니다. 주소창의 마이크 권한을 확인한 뒤 다시 시도해 주세요.";
  }

  return "마이크를 시작하지 못했습니다. 권한과 마이크 연결 상태를 확인한 뒤 다시 시도해 주세요.";
}

async function requestAiStatus(): Promise<AiStatus> {
  const response = await fetch("/api/ai/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("AI status request failed");
  }
  return response.json() as Promise<AiStatus>;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function storeChunk(blob: Blob): Promise<StoredChunkMeta> {
  const db = await openDatabase();
  const meta: StoredChunkMeta = {
    id: `chunk-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    size: blob.size,
    type: blob.type || "audio/webm",
    createdAt: new Date().toISOString()
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({ ...meta, blob, uploadStatus: "PENDING" satisfies StoredChunkRecord["uploadStatus"] });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
  });
  db.close();
  return meta;
}

async function readPendingChunks(): Promise<StoredChunkRecord[]> {
  const db = await openDatabase();
  const chunks = await new Promise<StoredChunkRecord[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result as StoredChunkRecord[]).filter((chunk) => chunk.uploadStatus !== "UPLOADED"));
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
  db.close();
  return chunks.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function markChunkUploaded(chunk: StoredChunkRecord): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({ ...chunk, uploadStatus: "UPLOADED" });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB update failed"));
  });
  db.close();
}

async function deleteLocalChunks(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
  });
  db.close();
}

export default function RecordingPanel({ meetingId }: RecordingPanelProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [storedBytes, setStoredBytes] = useState(0);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptSegment[]>(initialLiveTranscript);
  const [transcriptMessage, setTranscriptMessage] = useState("실시간 전사 초안은 저장 전까지 자유롭게 수정할 수 있습니다.");
  const [minutesDraft, setMinutesDraft] = useState<MinutesDraft | null>(null);
  const [minutesMessage, setMinutesMessage] = useState("전사 TXT를 저장한 뒤 AI 분석 보고서를 만들 수 있습니다.");
  const [analysisMode, setAnalysisMode] = useState<AiAnalysisMode>("ollama");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("transcript");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiStatusMessage, setAiStatusMessage] = useState("AI 연결 상태를 확인하고 있습니다.");
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [isFinalizingMinutes, setIsFinalizingMinutes] = useState(false);
  const [finalRecordMessage, setFinalRecordMessage] = useState("AI 분석 보고서를 수정한 뒤 최종 서버 저장 기록을 남길 수 있습니다.");
  const [recordingFileUrl, setRecordingFileUrl] = useState<string | null>(null);
  const [recordingFileName, setRecordingFileName] = useState("meeting-recording.webm");
  const [message, setMessage] = useState("마이크 권한을 허용하면 브라우저 녹음을 시작할 수 있습니다.");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<LiveSpeechRecognition | null>(null);
  const recognitionShouldRunRef = useRef(false);
  const recordingRequestIdRef = useRef(0);
  const liveDraftIdRef = useRef<string | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const minutesPaneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (state !== "recording") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      setLevel(Math.floor(30 + Math.random() * 65));
    }, 1000);
    levelTimerRef.current = timer;

    return () => {
      window.clearInterval(timer);
    };
  }, [state]);

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
    recordingRequestIdRef.current += 1;
    if (levelTimerRef.current) {
      window.clearInterval(levelTimerRef.current);
    }
    recognitionShouldRunRef.current = false;
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => {
    if (recordingFileUrl) {
      URL.revokeObjectURL(recordingFileUrl);
    }
  }, [recordingFileUrl]);

  function upsertLiveDraft(text: string, isFinal: boolean) {
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    const existingId = liveDraftIdRef.current;
    const nextId = existingId ?? `segment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    liveDraftIdRef.current = isFinal ? null : nextId;
    setLiveTranscript((segments) => {
      const withoutIntro = segments.filter((segment) => segment.id !== "intro");
      const existing = withoutIntro.find((segment) => segment.id === nextId);
      if (existing) {
        return withoutIntro.map((segment) => (
          segment.id === nextId
            ? { ...segment, text: cleanText, status: isFinal ? "saved" : "draft" }
            : segment
        ));
      }
      return [...withoutIntro, {
        id: nextId,
        timecode: formatElapsed(elapsedSeconds),
        speaker: "화자 A",
        rawText: cleanText,
        text: cleanText,
        status: isFinal ? "saved" : "draft"
      }];
    });
  }

  function startLiveRecognition() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setTranscriptMessage("이 브라우저는 실시간 음성 인식을 지원하지 않습니다. 녹음 후 STT 분석 또는 수동 문장 추가로 정리할 수 있습니다.");
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
      setTranscriptMessage("실시간 전사 중 오류가 발생했습니다. 녹음 파일은 계속 저장되며, 문장은 직접 추가할 수 있습니다.");
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

  async function startRecording() {
    if (!window.isSecureContext) {
      setState("error");
      setMessage("마이크 녹음은 HTTPS 또는 이 PC의 localhost 주소에서만 사용할 수 있습니다.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("error");
      setMessage("이 브라우저에서는 마이크 녹음을 사용할 수 없습니다. Chrome 또는 Edge에서 다시 열어주세요.");
      return;
    }

    const requestId = recordingRequestIdRef.current + 1;
    recordingRequestIdRef.current = requestId;
    let stream: MediaStream | null = null;

    try {
      setState("requesting");
      setMessage("마이크 권한을 확인하고 있습니다. 브라우저 상단 또는 주소창의 마이크 허용을 눌러주세요.");
      stream = await requestMicrophoneStream();
      if (requestId !== recordingRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const activeStream = stream;
      streamRef.current = activeStream;
      const options: MediaRecorderOptions = MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : {};
      const recorder = new MediaRecorder(activeStream, options);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      if (recordingFileUrl) {
        URL.revokeObjectURL(recordingFileUrl);
      }
      setRecordingFileUrl(null);
      setRecordingFileName(`meeting-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`);
      setChunkCount(0);
      setStoredBytes(0);
      setUploadedChunks(0);
      setUploadProgress(0);
      setUploadState("idle");
      setElapsedSeconds(0);
      setLiveTranscript([]);
      setWorkspaceView("transcript");
      setTranscriptMessage("말하는 내용이 전사 초안으로 표시됩니다. 잘못된 문장은 바로 고칠 수 있습니다.");
      setMessage("녹음 중입니다. 청크는 IndexedDB에 임시 저장됩니다.");

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }

        recordedChunksRef.current.push(event.data);
        storeChunk(event.data)
          .then((meta) => {
            setChunkCount((value) => value + 1);
            setStoredBytes((value) => value + meta.size);
          })
          .catch(() => {
            setState("error");
            setMessage("청크 임시 저장에 실패했습니다. 파일 업로드로 전환해 주세요.");
          });
      };
      recorder.onstop = () => {
        activeStream.getTracks().forEach((track) => track.stop());
        stopLiveRecognition();
        setLevel(0);
        setState("stopped");
        const recordingBlob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (recordingBlob.size > 0) {
          setRecordingFileUrl(URL.createObjectURL(recordingBlob));
          setMessage("녹음이 종료되었습니다. 녹음 파일 저장 버튼으로 PC 다운로드 폴더에 저장하세요.");
        } else {
          setMessage("녹음이 종료되었습니다. 저장할 음성 데이터가 없으면 전사 TXT만 정리할 수 있습니다.");
        }
      };
      recorder.start(5000);
      startLiveRecognition();
      setState("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (requestId !== recordingRequestIdRef.current) {
        return;
      }
      setState("error");
      setMessage(microphoneErrorMessage(error));
    }
  }

  function cancelRecordingRequest() {
    recordingRequestIdRef.current += 1;
    setState("idle");
    setMessage("마이크 권한 요청을 취소했습니다. 준비되면 녹음 시작을 다시 눌러주세요.");
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      stopLiveRecognition();
      setState("paused");
      setLevel(0);
      setMessage("녹음을 일시 중지했습니다. 재개하면 같은 세션에 이어서 저장됩니다.");
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startLiveRecognition();
      setState("recording");
      setMessage("녹음을 재개했습니다.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  async function confirmLocalChunks() {
    const chunks = await readPendingChunks();
    if (chunks.length === 0) {
      setUploadState("complete");
      setUploadProgress(100);
      setMessage("로컬에 보관할 대기 음성 청크가 없습니다. 서버에는 전사 TXT와 회의록만 저장합니다.");
      return;
    }

    setUploadState("uploading");
    setMessage("원본 음성 청크를 이 기기의 IndexedDB에만 보관하도록 확인합니다.");
    let uploaded = 0;

    try {
      for (const chunk of chunks) {
        await markChunkUploaded(chunk);
        uploaded += 1;
        setUploadedChunks((value) => value + 1);
        setUploadProgress(Math.round((uploaded / chunks.length) * 100));
      }

      setUploadState("complete");
      setMessage("원본 음성은 이 기기에만 보관됩니다. 서버에는 확인한 전사 TXT와 AI 분석 보고서만 저장하세요.");
    } catch (error) {
      void error;
      setUploadState("failed");
      setMessage("로컬 음성 보관 상태 확인에 실패했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.");
    }
  }

  async function deleteLocalAudio() {
    try {
      await deleteLocalChunks();
      setChunkCount(0);
      setStoredBytes(0);
      setUploadedChunks(0);
      setUploadProgress(0);
      setUploadState("idle");
      setMessage("이 기기에 임시 보관된 원본 음성 청크를 삭제했습니다. 서버의 전사 TXT와 AI 분석 보고서는 유지됩니다.");
    } catch (error) {
      void error;
      setUploadState("failed");
      setMessage("로컬 원본 음성 삭제에 실패했습니다. 브라우저 저장소 권한을 확인해 주세요.");
    }
  }

  function addManualTranscriptSegment() {
    setLiveTranscript((segments) => [...segments.filter((segment) => segment.id !== "intro"), {
      id: `segment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timecode: formatElapsed(elapsedSeconds),
      speaker: "화자 A",
      rawText: "새 전사 문장을 입력하세요.",
      text: "새 전사 문장을 입력하세요.",
      status: "draft"
    }]);
    setTranscriptMessage("새 문장을 추가했습니다. 내용을 수정한 뒤 저장하세요.");
  }

  function updateTranscriptSegment(id: string, text: string) {
    setLiveTranscript((segments) => segments.map((segment) => (
      segment.id === id ? { ...segment, text, status: "draft" } : segment
    )));
  }

  function deleteTranscriptSegment(id: string) {
    setLiveTranscript((segments) => {
      const nextSegments = segments.filter((segment) => segment.id !== id);
      return nextSegments.length > 0 ? nextSegments : initialLiveTranscript;
    });
    setTranscriptMessage("선택한 전사 문장을 삭제했습니다.");
  }

  async function saveTranscriptDraft() {
    const segmentsToSave = liveTranscript
      .filter((segment) => segment.id !== "intro" && segment.text.trim().length > 0)
      .map((segment, sequence) => {
        const startMs = timecodeToMs(segment.timecode);
        return {
          clientId: segment.id,
          sequence,
          speakerLabel: segment.speaker,
          startMs,
          endMs: startMs + 5000,
          rawText: segment.rawText,
          editedText: segment.text.trim(),
          source: segment.rawText === "새 전사 문장을 입력하세요." ? "MANUAL" : "LIVE",
          status: "CONFIRMED"
        };
      });

    if (!meetingId) {
      setLiveTranscript((segments) => segments.map((segment) => ({ ...segment, status: "saved" })));
      setTranscriptMessage("회의를 먼저 생성하면 전사 문장을 DB에 저장할 수 있습니다. 현재는 화면 초안으로만 저장했습니다.");
      return;
    }

    if (segmentsToSave.length === 0) {
      setTranscriptMessage("저장할 전사 문장이 없습니다. 문장을 추가하거나 실시간 전사를 받은 뒤 저장하세요.");
      return;
    }

    const response = await fetch("/api/transcripts/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        segments: segmentsToSave
      })
    });

    if (!response.ok) {
      setTranscriptMessage("전사 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setLiveTranscript((segments) => segments.map((segment) => ({ ...segment, status: "saved" })));
    setTranscriptMessage(`전사 문장 ${segmentsToSave.length}개를 회의에 저장했습니다. 이후 요약과 할 일 추출의 기준 문장으로 사용할 수 있습니다.`);
  }

  async function generateMinutesDraft() {
    if (!meetingId) {
      setMinutesMessage("회의를 먼저 생성하고 전사 TXT를 저장한 뒤 AI 분석 보고서를 만들 수 있습니다.");
      return;
    }

    setIsGeneratingMinutes(true);
    setMinutesMessage(analysisMode === "ollama"
      ? "로컬 AI가 저장된 전사 TXT를 분석하고 있습니다."
      : "Gemini가 저장된 전사 TXT를 분석하고 있습니다.");
    try {
      const response = await fetch("/api/minutes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          provider: analysisMode,
          fallbackSegments: liveTranscript
            .filter((segment) => segment.id !== "intro" && segment.text.trim().length > 0)
            .map((segment, sequence) => {
              const startMs = timecodeToMs(segment.timecode);
              return {
                clientId: segment.id,
                sequence,
                speakerLabel: segment.speaker,
                startMs,
                endMs: startMs + 5000,
                rawText: segment.rawText,
                editedText: segment.text.trim(),
                source: segment.rawText === "새 전사 문장을 입력하세요." ? "MANUAL" : "LIVE",
                status: "CONFIRMED"
              };
            })
        })
      });

      if (response.status === 409) {
        setMinutesMessage("저장된 전사 TXT가 필요합니다. 전사 저장을 먼저 눌러 주세요.");
        return;
      }
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { message?: string } | null;
        setMinutesMessage(errorPayload?.message ?? "AI 분석 보고서 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const payload = await response.json() as {
        minutes: MinutesDraft;
        provider: { kind: "mock" | AiAnalysisMode; model: string };
      };
      setMinutesDraft(payload.minutes);
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
      setMinutesMessage("AI 분석 서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
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
      setAiStatusMessage("AI 연결 상태를 확인하지 못했습니다.");
    }
  }

  function updateMinutesDraft<K extends keyof MinutesDraft>(key: K, value: MinutesDraft[K]) {
    setMinutesDraft((draft) => draft ? { ...draft, [key]: value } : draft);
  }

  function splitLines(value: string): string[] {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  async function finalizeMinutesDraft() {
    if (!meetingId || !minutesDraft) {
      setFinalRecordMessage("AI 분석 보고서를 먼저 생성한 뒤 최종 서버 저장 기록을 남길 수 있습니다.");
      return;
    }

    setIsFinalizingMinutes(true);
    setFinalRecordMessage("수정한 AI 분석 보고서를 최종 기록으로 서버에 저장합니다.");
    try {
      const response = await fetch("/api/minutes/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          ...minutesDraft
        })
      });

      if (!response.ok) {
        setFinalRecordMessage("최종 서버 저장 기록을 남기지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const payload = await response.json() as { minutes: MinutesDraft };
      setMinutesDraft(payload.minutes);
      setFinalRecordMessage("최종 서버 저장 기록을 남겼습니다. 서버에는 전사 TXT와 확정 회의록만 저장됩니다.");
    } finally {
      setIsFinalizingMinutes(false);
    }
  }

  const canStart = state === "idle" || state === "stopped" || state === "error";
  const canPause = state === "recording";
  const canResume = state === "paused";
  const canStop = state === "recording" || state === "paused";
  const visibleTranscript = [...liveTranscript].reverse();
  const selectedAiStatus = aiStatus?.[analysisMode] ?? null;
  const analysisAvailable = aiStatus?.activeProvider === "mock" || selectedAiStatus?.available === true;
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
    <section className="recorder-panel" aria-label="브라우저 녹음">
      <div className="recorder-status">
        <strong>{recordingStatus}</strong>
        <span>{formatElapsed(elapsedSeconds)}</span>
      </div>
      <div className="level-meter" aria-label={`입력 레벨 ${level}%`}>
        <span style={{ width: `${level}%` }} />
      </div>
      <div className="toolbar" aria-label="브라우저 녹음 제어">
        <button className="button" type="button" onClick={startRecording} disabled={!canStart}>
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
        <a className="button secondary download-link" href={recordingFileUrl} download={recordingFileName}>
          녹음 파일 저장
        </a>
      ) : null}
      <div className="local-audio-row">
        <div className="upload-meter" aria-label={`업로드 진행률 ${uploadProgress}%`}>
          <span style={{ width: `${uploadProgress}%` }} />
        </div>
        <div className="toolbar">
          <button className="button secondary" type="button" onClick={confirmLocalChunks} disabled={uploadState === "uploading"}>
            {uploadState === "failed" ? "로컬 보관 재확인" : "로컬 음성 보관 확인"}
          </button>
          <button className="button danger" type="button" aria-label="로컬 원본 음성 삭제" onClick={deleteLocalAudio} disabled={state === "recording" || state === "paused"}>
            원본 삭제
          </button>
        </div>
      </div>
      <p className="muted">{message}</p>
      <div className="recorder-facts">
        <span>임시 청크 {chunkCount}개</span>
        <span>로컬 확인 {uploadedChunks}개</span>
        <span>진행률 {uploadProgress}%</span>
        <span>{storedBytes.toLocaleString("ko-KR")} bytes</span>
        <span>{uploadState === "complete" ? "로컬 보관 확인" : uploadState === "failed" ? "재확인 대기" : state === "error" ? "파일 업로드 대안 필요" : "IndexedDB 로컬 보관"}</span>
      </div>
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
            </div>
            <button className="button" type="button" onClick={generateMinutesDraft} disabled={isGeneratingMinutes || !analysisAvailable}>
              {isGeneratingMinutes ? "AI 분석 중" : "AI 보고서 생성"}
            </button>
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
          <div className={`ai-provider-status ${analysisAvailable ? "ready" : "unavailable"}`} role="status">
            <strong>{analysisMode === "ollama" ? "로컬 AI" : "Gemini"}</strong>
            <span>{selectedAiStatus ? `${selectedAiStatus.model} · ${selectedAiStatus.message}` : aiStatusMessage}</span>
            {analysisMode === "gemini" && selectedAiStatus?.available ? (
              <span>분석할 전사 TXT가 Google Gemini API로 전송됩니다.</span>
            ) : null}
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
                  최종 서버 저장 기록 남기기
                </button>
                <p className="muted">{finalRecordMessage}</p>
              </div>
            </div>
          ) : null}
        </section>
        <section
          className="live-transcript-editor workspace-pane"
          data-mobile-active={workspaceView === "transcript"}
          aria-label="실시간 전사 편집"
        >
          <div className="editor-heading pane-heading">
            <div>
              <strong>실시간 TXT</strong>
              <p className="muted">{transcriptMessage}</p>
            </div>
            <div className="toolbar">
              <button className="button secondary" type="button" onClick={addManualTranscriptSegment}>문장 추가</button>
              <button className="button" type="button" onClick={saveTranscriptDraft}>전사 저장</button>
            </div>
          </div>
          <div className="live-segment-list">
            {visibleTranscript.map((segment, index) => (
              <article className="live-segment" key={segment.id}>
                <div className="live-segment-meta">
                  <span>{segment.timecode}</span>
                  <span>{segment.speaker}</span>
                  <span>{segment.status === "saved" ? "저장됨" : "수정 중"}</span>
                  <button
                    className="icon-button delete-segment-button"
                    type="button"
                    title="문장 삭제"
                    aria-label={`전사 문장 ${index + 1} 삭제`}
                    onClick={() => deleteTranscriptSegment(segment.id)}
                  >
                    ×
                  </button>
                </div>
                <label>
                  전사 문장 {index + 1}
                  <textarea
                    value={segment.text}
                    onChange={(event) => updateTranscriptSegment(segment.id, event.target.value)}
                    rows={2}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
