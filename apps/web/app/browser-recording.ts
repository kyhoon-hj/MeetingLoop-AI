import { audioQualityReportSchema, type AudioQualityFrame, type AudioQualityReport } from "@meetingloop/domain";

export type BrowserStorageMode = "indexeddb" | "memory";
export type NetworkState = "online" | "offline";

export interface StoredChunkMeta {
  id: string;
  sessionId: string;
  meetingId: string;
  recordingId: string;
  partNumber: number;
  size: number;
  type: string;
  createdAt: string;
}

export interface StoredChunkRecord extends StoredChunkMeta {
  blob: Blob;
  uploadStatus: "PENDING" | "UPLOADED" | "FAILED";
}

export const inputTestDurationMs = 5_000;
export const audioQualityFrameMs = 250;
export const microphoneRequestTimeoutMs = 30_000;
export const localSessionStorageKey = "meetingloop-active-recording-session";

const databaseName = "meetingloop-recordings";
const storeName = "chunks";
const recordingMimeTypeCandidates = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac"
] as const;

export function preferredRecordingMimeType(recorder: typeof MediaRecorder = MediaRecorder): string | undefined {
  return recordingMimeTypeCandidates.find((mimeType) => {
    try {
      return recorder.isTypeSupported(mimeType);
    } catch {
      return false;
    }
  });
}

export function recordingExtension(mimeType: string): "m4a" | "ogg" | "webm" {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("aac") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  return "webm";
}

export function recordingName(mimeType: string, timestamp = new Date()): string {
  return `meeting-recording-${timestamp.toISOString().replace(/[:.]/g, "-")}.${recordingExtension(mimeType)}`;
}

export function microphoneErrorMessage(error: unknown): string {
  const errorName = error instanceof DOMException ? error.name : "";
  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    return "마이크 권한이 차단되었습니다. 주소창의 마이크 아이콘에서 권한을 허용한 뒤 다시 눌러주세요.";
  }
  if (errorName === "NotFoundError") return "사용할 수 있는 마이크를 찾지 못했습니다. 마이크 연결 상태를 확인해 주세요.";
  if (errorName === "NotReadableError" || errorName === "AbortError") {
    return "다른 앱이 마이크를 사용 중입니다. 해당 앱을 닫은 뒤 다시 시도해 주세요.";
  }
  if (errorName === "TimeoutError") {
    return "마이크 권한 확인 시간이 초과되었습니다. 주소창의 마이크 권한을 확인한 뒤 다시 시도해 주세요.";
  }
  return "마이크를 시작하지 못했습니다. 권한과 마이크 연결 상태를 확인한 뒤 다시 시도해 주세요.";
}

export function requestMicrophoneStream(): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      settled = true;
      reject(new DOMException("Microphone permission request timed out", "TimeoutError"));
    }, microphoneRequestTimeoutMs);

    navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    }).then((stream) => {
      if (settled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(stream);
    }).catch((error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}

export function analyzeBrowserAudioQuality(input: {
  meetingId: string;
  recordingId: string;
  source: "BROWSER_INPUT_TEST" | "BROWSER_RECORDING";
  durationMs: number;
  sampleRate: number;
  channelCount: number;
  frames: AudioQualityFrame[];
}): AudioQualityReport {
  const thresholds = { silenceRms: 0.012, lowVolumeRms: 0.04, clippingPeak: 0.985, noiseZcr: 0.36 } as const;
  let silence = 0;
  let lowVolume = 0;
  let clipping = 0;
  let noise = 0;
  let total = 0;
  for (const frame of input.frames) {
    const duration = Math.max(1, frame.endMs - frame.startMs);
    const silent = frame.rms < thresholds.silenceRms;
    total += duration;
    if (silent) silence += duration;
    if (!silent && frame.rms < thresholds.lowVolumeRms) lowVolume += duration;
    if (frame.peak >= thresholds.clippingPeak) clipping += duration;
    if (!silent && frame.zeroCrossingRate >= thresholds.noiseZcr) noise += duration;
  }
  const ratio = (value: number) => total === 0 ? 0 : Math.round((value / total) * 10_000) / 10_000;
  const silenceRatio = ratio(silence);
  const lowVolumeRatio = ratio(lowVolume);
  const clippingRatio = ratio(clipping);
  const noiseRatio = ratio(noise);
  const overallScore = Math.max(0, Math.min(100, Math.round(
    100 - silenceRatio * 30 - lowVolumeRatio * 24 - clippingRatio * 48 - noiseRatio * 34
  )));
  const recommendations: string[] = [];
  if (silenceRatio > 0.55) recommendations.push("마이크 권한과 입력 장치를 확인하세요.");
  if (lowVolumeRatio > 0.3) recommendations.push("마이크를 20~40cm 거리로 옮겨 주세요.");
  if (clippingRatio > 0.03) recommendations.push("입력 음량을 낮춰 왜곡을 줄여 주세요.");
  if (noiseRatio > 0.2) recommendations.push("조용한 장소나 헤드셋 마이크를 권장합니다.");
  if (recommendations.length === 0) recommendations.push("현재 입력 품질이 안정적입니다.");

  return audioQualityReportSchema.parse({
    id: `${input.recordingId}-quality`,
    organizationId: "browser-only",
    meetingId: input.meetingId,
    recordingId: input.recordingId,
    source: input.source,
    persistence: "BROWSER_ONLY",
    durationMs: Math.max(1, Math.round(input.durationMs)),
    sampleRate: input.sampleRate,
    channelCount: input.channelCount,
    speechRatio: Math.max(0, 1 - silenceRatio - noiseRatio),
    silenceRatio,
    lowVolumeRatio,
    clippingRatio,
    noiseRatio,
    overlapRatio: 0,
    echoScore: null,
    reverberationScore: null,
    overallScore,
    recommendPreciseAnalysis: overallScore < 75,
    recommendations,
    analyzerVersion: "browser-frame-quality-v1",
    metricsJson: { analyzedDurationMs: total, frameCount: input.frames.length, thresholds },
    createdAt: new Date().toISOString()
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

export async function storeBrowserChunk(
  blob: Blob,
  input: { sessionId: string; meetingId: string; recordingId: string; partNumber: number }
): Promise<StoredChunkMeta> {
  const db = await openDatabase();
  const meta: StoredChunkMeta = {
    id: `chunk-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...input,
    size: blob.size,
    type: blob.type || "audio/webm",
    createdAt: new Date().toISOString()
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({ ...meta, blob, uploadStatus: "PENDING" });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
  });
  db.close();
  return meta;
}

export async function readBrowserChunks(sessionId?: string): Promise<StoredChunkRecord[]> {
  const db = await openDatabase();
  const chunks = await new Promise<StoredChunkRecord[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result as StoredChunkRecord[]).filter((chunk) => !sessionId || chunk.sessionId === sessionId));
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
  db.close();
  return chunks.sort((left, right) => left.partNumber - right.partNumber || left.createdAt.localeCompare(right.createdAt));
}

export async function markBrowserChunkConfirmed(chunk: StoredChunkRecord): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({ ...chunk, uploadStatus: "UPLOADED" });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB update failed"));
  });
  db.close();
}

export async function deleteBrowserChunks(sessionId?: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    if (!sessionId) {
      store.clear();
    } else {
      const request = store.getAll();
      request.onsuccess = () => {
        for (const chunk of request.result as StoredChunkRecord[]) {
          if (chunk.sessionId === sessionId) store.delete(chunk.id);
        }
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
  });
  db.close();
}
