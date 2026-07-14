"use client";

import { useEffect, useRef, useState } from "react";

type RecordingState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "error";
type UploadState = "idle" | "uploading" | "failed" | "complete";
type TranscriptStatus = "draft" | "saved";

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

declare global {
  interface Window {
    SpeechRecognition?: new () => LiveSpeechRecognition;
    webkitSpeechRecognition?: new () => LiveSpeechRecognition;
  }
}

const databaseName = "meetingloop-recordings";
const storeName = "chunks";
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
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [message, setMessage] = useState("마이크 권한을 허용하면 브라우저 녹음을 시작할 수 있습니다.");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<LiveSpeechRecognition | null>(null);
  const recognitionShouldRunRef = useRef(false);
  const liveDraftIdRef = useRef<string | null>(null);

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

  useEffect(() => () => {
    if (levelTimerRef.current) {
      window.clearInterval(levelTimerRef.current);
    }
    recognitionShouldRunRef.current = false;
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

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
        recognition.start();
      }
    };
    recognitionRef.current = recognition;
    recognitionShouldRunRef.current = true;
    recognition.start();
  }

  function stopLiveRecognition() {
    recognitionShouldRunRef.current = false;
    recognitionRef.current?.stop();
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("error");
      setMessage("이 브라우저에서는 녹음을 사용할 수 없습니다. 파일 업로드를 사용해 주세요.");
      return;
    }

    try {
      setState("requesting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const options: MediaRecorderOptions = MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      setChunkCount(0);
      setStoredBytes(0);
      setUploadedChunks(0);
      setUploadProgress(0);
      setUploadState("idle");
      setElapsedSeconds(0);
      setLiveTranscript([]);
      setTranscriptMessage("말하는 내용이 전사 초안으로 표시됩니다. 잘못된 문장은 바로 고칠 수 있습니다.");
      setMessage("녹음 중입니다. 청크는 IndexedDB에 임시 저장됩니다.");

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }

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
        stream.getTracks().forEach((track) => track.stop());
        stopLiveRecognition();
        setLevel(0);
        setState("stopped");
        setMessage("녹음이 종료되었습니다. 연결 복구 후 저장된 청크를 업로드할 수 있습니다.");
      };
      recorder.start(5000);
      startLiveRecognition();
      setState("recording");
    } catch (error) {
      void error;
      setState("error");
      setMessage("마이크 권한이 필요합니다. 권한을 허용하거나 파일 업로드를 사용해 주세요.");
    }
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
    setMinutesMessage("서버에 저장된 전사 TXT만 사용해 AI 분석 보고서를 생성합니다.");
    try {
      const response = await fetch("/api/minutes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
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
        setMinutesMessage("AI 분석 보고서 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const payload = await response.json() as { minutes: MinutesDraft };
      setMinutesDraft(payload.minutes);
      setMinutesMessage("AI 분석 보고서를 서버에 저장했습니다. 원본 음성은 서버에 저장하지 않습니다.");
    } finally {
      setIsGeneratingMinutes(false);
    }
  }

  const canStart = state === "idle" || state === "stopped" || state === "error";
  const canPause = state === "recording";
  const canResume = state === "paused";
  const canStop = state === "recording" || state === "paused";

  return (
    <section className="recorder-panel" aria-label="브라우저 녹음">
      <div className="recorder-status">
        <strong>{state === "recording" ? "녹음 중" : state === "paused" ? "일시 중지" : state === "stopped" ? "녹음 종료" : "녹음 대기"}</strong>
        <span>{formatElapsed(elapsedSeconds)}</span>
      </div>
      <div className="level-meter" aria-label={`입력 레벨 ${level}%`}>
        <span style={{ width: `${level}%` }} />
      </div>
      <div className="toolbar" aria-label="브라우저 녹음 제어">
        <button className="button" type="button" onClick={startRecording} disabled={!canStart}>녹음 시작</button>
        <button className="button secondary" type="button" onClick={pauseRecording} disabled={!canPause}>일시 중지</button>
        <button className="button secondary" type="button" onClick={resumeRecording} disabled={!canResume}>재개</button>
        <button className="button danger" type="button" onClick={stopRecording} disabled={!canStop}>종료</button>
      </div>
      <div className="upload-meter" aria-label={`업로드 진행률 ${uploadProgress}%`}>
        <span style={{ width: `${uploadProgress}%` }} />
      </div>
      <button className="button secondary" type="button" onClick={confirmLocalChunks} disabled={uploadState === "uploading"}>
        {uploadState === "failed" ? "로컬 보관 재확인" : "로컬 음성 보관 확인"}
      </button>
      <button className="button danger" type="button" onClick={deleteLocalAudio} disabled={state === "recording" || state === "paused"}>
        로컬 원본 음성 삭제
      </button>
      <p className="muted">{message}</p>
      <div className="recorder-facts">
        <span>임시 청크 {chunkCount}개</span>
        <span>로컬 확인 {uploadedChunks}개</span>
        <span>진행률 {uploadProgress}%</span>
        <span>{storedBytes.toLocaleString("ko-KR")} bytes</span>
        <span>{uploadState === "complete" ? "로컬 보관 확인" : uploadState === "failed" ? "재확인 대기" : state === "error" ? "파일 업로드 대안 필요" : "IndexedDB 로컬 보관"}</span>
      </div>
      <section className="live-transcript-editor" aria-label="실시간 전사 편집">
        <div className="editor-heading">
          <div>
            <strong>실시간 전사 편집</strong>
            <p className="muted">{transcriptMessage}</p>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button" onClick={addManualTranscriptSegment}>문장 추가</button>
            <button className="button" type="button" onClick={saveTranscriptDraft}>전사 저장</button>
            <button className="button secondary" type="button" onClick={generateMinutesDraft} disabled={isGeneratingMinutes}>
              AI 분석 보고서 생성
            </button>
          </div>
        </div>
        <div className="live-segment-list">
          {liveTranscript.map((segment, index) => (
            <article className="live-segment" key={segment.id}>
              <div className="live-segment-meta">
                <span>{segment.timecode}</span>
                <span>{segment.speaker}</span>
                <span>{segment.status === "saved" ? "저장됨" : "수정 중"}</span>
              </div>
              <label>
                전사 문장 {index + 1}
                <textarea
                  value={segment.text}
                  onChange={(event) => updateTranscriptSegment(segment.id, event.target.value)}
                  rows={3}
                />
              </label>
              <button className="button danger" type="button" onClick={() => deleteTranscriptSegment(segment.id)}>문장 삭제</button>
            </article>
          ))}
        </div>
      </section>
      <section className="minutes-draft" aria-label="AI 분석 보고서">
        <div>
          <strong>AI 분석 보고서</strong>
          <p className="muted">{minutesMessage}</p>
        </div>
        {minutesDraft ? (
          <div className="minutes-body">
            <h3>{minutesDraft.title}</h3>
            <p>{minutesDraft.summary}</p>
            <strong>요약 보고서</strong>
            <ul>
              {minutesDraft.keyPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <strong>주요 논의</strong>
            <ul>
              {minutesDraft.discussionTopics.map((topic) => <li key={topic}>{topic}</li>)}
            </ul>
            <strong>결정</strong>
            <ul>
              {minutesDraft.decisions.map((decision) => <li key={decision}>{decision}</li>)}
            </ul>
            <strong>할 일</strong>
            <ul>
              {minutesDraft.actionItems.map((item) => <li key={item.content}>{item.content}</li>)}
            </ul>
            <strong>리스크</strong>
            <ul>
              {minutesDraft.risks.map((risk) => <li key={risk}>{risk}</li>)}
            </ul>
            <strong>미결 질문</strong>
            <ul>
              {minutesDraft.openQuestions.map((question) => <li key={question}>{question}</li>)}
            </ul>
          </div>
        ) : null}
      </section>
    </section>
  );
}
