"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioQualityFrame, AudioQualityReport } from "@meetingloop/domain";
import {
  analyzeBrowserAudioQuality,
  audioQualityFrameMs,
  deleteBrowserChunks,
  inputTestDurationMs,
  localSessionStorageKey,
  markBrowserChunkConfirmed,
  microphoneErrorMessage,
  preferredRecordingMimeType,
  readBrowserChunks,
  recordingName,
  requestMicrophoneStream,
  storeBrowserChunk,
  type BrowserStorageMode,
  type NetworkState
} from "./browser-recording";

export type RecordingState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "error";
export type InputTestState = "idle" | "running" | "complete" | "error";
export type LocalConfirmationState = "idle" | "confirming" | "failed" | "complete";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

interface UseBrowserRecordingOptions {
  meetingId?: string | undefined;
  onRecordingStart(): void;
  onStartRecognition(): void;
  onStopRecognition(): void;
  onFeedback(title: string, message: string, tone?: "error" | "warning" | "info"): void;
}

export function useBrowserRecording(options: UseBrowserRecordingOptions) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState("마이크 권한을 허용하면 브라우저 녹음을 시작할 수 있습니다.");
  const [networkState, setNetworkState] = useState<NetworkState>("online");
  const [storageMode, setStorageMode] = useState<BrowserStorageMode>("indexeddb");
  const [chunkCount, setChunkCount] = useState(0);
  const [storedBytes, setStoredBytes] = useState(0);
  const [confirmedChunks, setConfirmedChunks] = useState(0);
  const [confirmationState, setConfirmationState] = useState<LocalConfirmationState>("idle");
  const [confirmationProgress, setConfirmationProgress] = useState(0);
  const [recordingFileUrl, setRecordingFileUrl] = useState<string | null>(null);
  const [recordingFileName, setRecordingFileName] = useState("meeting-recording.webm");
  const [recordingFileSize, setRecordingFileSize] = useState(0);
  const [inputTestState, setInputTestState] = useState<InputTestState>("idle");
  const [inputTestRemainingMs, setInputTestRemainingMs] = useState(inputTestDurationMs);
  const [inputTestReport, setInputTestReport] = useState<AudioQualityReport | null>(null);
  const [recordingQualityReport, setRecordingQualityReport] = useState<AudioQualityReport | null>(null);
  const [qualityMessage, setQualityMessage] = useState("녹음 전 5초 점검으로 음량·무음·왜곡·소음 후보를 확인할 수 있습니다.");
  const [isAnalyzingQuality, setIsAnalyzingQuality] = useState(false);

  const callbacksRef = useRef(options);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRequestIdRef = useRef(0);
  const inputTestRequestIdRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const inputTestTimerRef = useRef<number | null>(null);
  const localSessionIdRef = useRef<string | null>(null);
  const recordingIdRef = useRef("browser-recording");
  const partNumberRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const qualityFramesRef = useRef<AudioQualityFrame[]>([]);
  const sampleRateRef = useRef(48_000);
  const channelCountRef = useRef(1);
  const fileUrlRef = useRef<string | null>(null);
  const storageModeRef = useRef<BrowserStorageMode>("indexeddb");

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  const replaceFileUrl = useCallback((url: string | null) => {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = url;
    setRecordingFileUrl(url);
  }, []);

  const stopLevelMeter = useCallback((resetLevel = true) => {
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    if (resetLevel) setLevel(0);
  }, []);

  const startLevelMeter = useCallback((stream: MediaStream, onFrame?: (frame: AudioQualityFrame) => void) => {
    stopLevelMeter(false);
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      const context = new AudioContextConstructor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const settings = stream.getAudioTracks()[0]?.getSettings?.();
      sampleRateRef.current = context.sampleRate;
      channelCountRef.current = settings?.channelCount ?? 1;
      audioContextRef.current = context;
      void context.resume().catch(() => undefined);
      let sequence = 0;
      let lastFrameAt = performance.now() - audioQualityFrameMs;
      const update = () => {
        analyser.getByteTimeDomainData(samples);
        let sumSquares = 0;
        let peak = 0;
        let zeroCrossings = 0;
        let previous = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
          peak = Math.max(peak, Math.abs(normalized));
          if ((previous < 0 && normalized >= 0) || (previous >= 0 && normalized < 0)) zeroCrossings += 1;
          previous = normalized;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        setLevel(Math.min(100, Math.round(rms * 360)));
        const now = performance.now();
        if (onFrame && now - lastFrameAt >= audioQualityFrameMs) {
          const startMs = sequence * audioQualityFrameMs;
          onFrame({
            sequence,
            startMs,
            endMs: startMs + audioQualityFrameMs,
            rms: Math.min(1, rms),
            peak: Math.min(1, peak),
            zeroCrossingRate: samples.length > 1 ? zeroCrossings / (samples.length - 1) : 0
          });
          sequence += 1;
          lastFrameAt = now;
        }
        animationFrameRef.current = window.requestAnimationFrame(update);
      };
      update();
    } catch {
      stopLevelMeter();
    }
  }, [stopLevelMeter]);

  const refreshChunkSummary = useCallback(async (sessionId = localSessionIdRef.current) => {
    if (!sessionId || typeof indexedDB === "undefined") return;
    try {
      const chunks = await readBrowserChunks(sessionId);
      if (options.meetingId && chunks.some((chunk) => chunk.meetingId !== options.meetingId)) return;
      setChunkCount(chunks.length);
      setStoredBytes(chunks.reduce((total, chunk) => total + chunk.size, 0));
      const confirmed = chunks.filter((chunk) => chunk.uploadStatus === "UPLOADED").length;
      setConfirmedChunks(confirmed);
      setConfirmationProgress(chunks.length === 0 ? 0 : Math.round((confirmed / chunks.length) * 100));
    } catch {
      setStorageMode("memory");
    }
  }, [options.meetingId]);

  useEffect(() => {
    const updateNetwork = () => setNetworkState(navigator.onLine ? "online" : "offline");
    const handleOnline = () => {
      updateNetwork();
      setMessage("네트워크가 다시 연결되었습니다. 원본 음성은 계속 이 기기에 보관됩니다.");
    };
    const handleOffline = () => {
      updateNetwork();
      setMessage("네트워크가 끊겼습니다. 녹음과 로컬 임시 저장은 계속되고, 서버 저장은 연결 후 다시 시도하세요.");
    };
    updateNetwork();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    try {
      localSessionIdRef.current = window.localStorage.getItem(localSessionStorageKey);
    } catch {
      localSessionIdRef.current = null;
    }
    void refreshChunkSummary();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshChunkSummary]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => () => {
    recordingRequestIdRef.current += 1;
    inputTestRequestIdRef.current += 1;
    if (inputTestTimerRef.current !== null) window.clearInterval(inputTestTimerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopLevelMeter();
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
  }, [stopLevelMeter]);

  const runInputTest = useCallback(async () => {
    if (!window.isSecureContext) {
      setInputTestState("error");
      setQualityMessage("마이크 점검은 HTTPS 또는 이 PC의 localhost 주소에서만 사용할 수 있습니다.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setInputTestState("error");
      setQualityMessage("이 브라우저에서는 마이크 입력 점검을 사용할 수 없습니다.");
      return;
    }
    const requestId = inputTestRequestIdRef.current + 1;
    inputTestRequestIdRef.current = requestId;
    const frames: AudioQualityFrame[] = [];
    let stream: MediaStream | null = null;
    try {
      setInputTestState("running");
      setInputTestReport(null);
      setInputTestRemainingMs(inputTestDurationMs);
      setQualityMessage("5초 동안 평소 목소리로 말해 주세요. 입력 레벨을 측정하고 있습니다.");
      stream = await requestMicrophoneStream();
      if (requestId !== inputTestRequestIdRef.current) return;
      startLevelMeter(stream, (frame) => frames.push(frame));
      const startedAt = performance.now();
      inputTestTimerRef.current = window.setInterval(() => {
        setInputTestRemainingMs(Math.max(0, inputTestDurationMs - (performance.now() - startedAt)));
      }, 100);
      await new Promise<void>((resolve) => window.setTimeout(resolve, inputTestDurationMs));
      if (requestId !== inputTestRequestIdRef.current) return;
      if (frames.length === 0) throw new Error("AUDIO_LEVEL_UNAVAILABLE");
      const report = analyzeBrowserAudioQuality({
        meetingId: options.meetingId ?? "local-input-test",
        recordingId: `input-test-${Date.now()}`,
        source: "BROWSER_INPUT_TEST",
        durationMs: inputTestDurationMs,
        sampleRate: sampleRateRef.current,
        channelCount: channelCountRef.current,
        frames
      });
      setInputTestReport(report);
      setInputTestState("complete");
      setInputTestRemainingMs(0);
      setQualityMessage(report.recommendPreciseAnalysis
        ? "입력 품질을 조정한 뒤 다시 점검하는 것이 좋습니다."
        : "마이크 입력이 안정적입니다. 바로 녹음을 시작할 수 있습니다.");
    } catch (error) {
      setInputTestState("error");
      setQualityMessage(error instanceof Error && error.message === "AUDIO_LEVEL_UNAVAILABLE"
        ? "입력 레벨을 읽지 못했습니다. 다른 브라우저나 마이크를 확인해 주세요."
        : microphoneErrorMessage(error));
    } finally {
      if (inputTestTimerRef.current !== null) window.clearInterval(inputTestTimerRef.current);
      inputTestTimerRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      stopLevelMeter();
    }
  }, [options.meetingId, startLevelMeter, stopLevelMeter]);

  const startRecording = useCallback(async () => {
    if (!window.isSecureContext) {
      setState("error");
      const detail = "마이크 녹음은 HTTPS 또는 이 PC의 localhost 주소에서만 사용할 수 있습니다.";
      setMessage(detail);
      callbacksRef.current.onFeedback("안전한 접속 주소가 필요합니다", detail, "warning");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("error");
      const detail = "이 브라우저에서는 마이크 녹음을 사용할 수 없습니다. Chrome, Edge 또는 Safari 최신 버전에서 다시 열어주세요.";
      setMessage(detail);
      callbacksRef.current.onFeedback("마이크 녹음을 사용할 수 없습니다", detail, "warning");
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
      const mimeType = preferredRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const actualMimeType = recorder.mimeType || mimeType || "audio/webm";
      const sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const recordingId = `recording-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localSessionIdRef.current = sessionId;
      recordingIdRef.current = recordingId;
      partNumberRef.current = 0;
      chunksRef.current = [];
      qualityFramesRef.current = [];
      recorderRef.current = recorder;
      streamRef.current = stream;
      storageModeRef.current = "indexeddb";
      setStorageMode("indexeddb");
      try {
        window.localStorage.setItem(localSessionStorageKey, sessionId);
      } catch {
        // IndexedDB may still be available in private browsing.
      }
      replaceFileUrl(null);
      setRecordingFileName(recordingName(actualMimeType));
      setRecordingFileSize(0);
      setChunkCount(0);
      setStoredBytes(0);
      setConfirmedChunks(0);
      setConfirmationProgress(0);
      setConfirmationState("idle");
      setRecordingQualityReport(null);
      setElapsedSeconds(0);
      callbacksRef.current.onRecordingStart();
      setMessage(navigator.onLine
        ? "녹음 중입니다. 원본 청크는 이 브라우저의 IndexedDB에만 임시 저장됩니다."
        : "오프라인 상태에서도 녹음을 계속합니다. 원본 청크는 이 브라우저에만 저장됩니다.");

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        chunksRef.current.push(event.data);
        const partNumber = partNumberRef.current;
        partNumberRef.current += 1;
        storeBrowserChunk(event.data, {
          sessionId,
          meetingId: options.meetingId ?? "local-meeting",
          recordingId,
          partNumber
        }).then(() => {
          setChunkCount((value) => value + 1);
          setStoredBytes((value) => value + event.data.size);
        }).catch(() => {
          storageModeRef.current = "memory";
          setStorageMode("memory");
          setChunkCount(chunksRef.current.length);
          setStoredBytes(chunksRef.current.reduce((total, chunk) => total + chunk.size, 0));
          setMessage("브라우저 저장 공간을 사용할 수 없어 메모리에 임시 보관 중입니다. 녹음을 종료한 뒤 즉시 파일로 저장하세요.");
        });
      };
      recorder.onerror = () => {
        setMessage("브라우저 녹음기 오류가 발생했습니다. 현재까지 수집한 음성은 종료 후 파일로 저장할 수 있습니다.");
      };
      recorder.onstop = () => {
        stream?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        callbacksRef.current.onStopRecognition();
        stopLevelMeter();
        setState("stopped");
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        setRecordingFileSize(blob.size);
        if (blob.size > 0) {
          replaceFileUrl(URL.createObjectURL(blob));
          setMessage(storageModeRef.current === "memory"
            ? "녹음이 종료되었습니다. 메모리 임시 보관본을 새로고침 전에 기기에 저장하세요."
            : "녹음이 종료되었습니다. 원본 음성은 서버로 전송되지 않았으며 기기에 저장할 수 있습니다.");
        } else {
          setMessage("녹음이 종료되었습니다. 저장할 음성 데이터가 없으면 전사 TXT만 정리할 수 있습니다.");
        }
        if (qualityFramesRef.current.length > 0) {
          setIsAnalyzingQuality(true);
          const report = analyzeBrowserAudioQuality({
            meetingId: options.meetingId ?? "local-meeting",
            recordingId,
            source: "BROWSER_RECORDING",
            durationMs: qualityFramesRef.current.length * audioQualityFrameMs,
            sampleRate: sampleRateRef.current,
            channelCount: channelCountRef.current,
            frames: qualityFramesRef.current
          });
          setRecordingQualityReport(report);
          setIsAnalyzingQuality(false);
        }
      };
      recorder.start(5_000);
      startLevelMeter(stream, (frame) => {
        const sequence = qualityFramesRef.current.length;
        qualityFramesRef.current.push({
          ...frame,
          sequence,
          startMs: sequence * audioQualityFrameMs,
          endMs: (sequence + 1) * audioQualityFrameMs
        });
      });
      callbacksRef.current.onStartRecognition();
      setState("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (requestId !== recordingRequestIdRef.current) return;
      setState("error");
      const detail = microphoneErrorMessage(error);
      setMessage(detail);
      callbacksRef.current.onFeedback("마이크를 시작하지 못했습니다", detail, "warning");
    }
  }, [options.meetingId, replaceFileUrl, startLevelMeter, stopLevelMeter]);

  const cancelRecordingRequest = useCallback(() => {
    recordingRequestIdRef.current += 1;
    setState("idle");
    setMessage("마이크 권한 요청을 취소했습니다. 준비되면 녹음 시작을 다시 눌러주세요.");
  }, []);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current?.state !== "recording") return;
    recorderRef.current.pause();
    callbacksRef.current.onStopRecognition();
    stopLevelMeter();
    setState("paused");
    setMessage("녹음을 일시 중지했습니다. 재개하면 같은 세션에 이어서 저장됩니다.");
  }, [stopLevelMeter]);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current?.state !== "paused") return;
    recorderRef.current.resume();
    if (streamRef.current) {
      startLevelMeter(streamRef.current, (frame) => {
        const sequence = qualityFramesRef.current.length;
        qualityFramesRef.current.push({ ...frame, sequence, startMs: sequence * audioQualityFrameMs, endMs: (sequence + 1) * audioQualityFrameMs });
      });
    }
    callbacksRef.current.onStartRecognition();
    setState("recording");
    setMessage("녹음을 재개했습니다. 원본 음성은 계속 브라우저에만 저장됩니다.");
  }, [startLevelMeter]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }, []);

  const confirmLocalChunks = useCallback(async () => {
    if (storageMode === "memory") {
      setConfirmationState("complete");
      setConfirmationProgress(100);
      setConfirmedChunks(chunksRef.current.length);
      setMessage("메모리 임시 보관 상태입니다. 새로고침 전에 녹음 파일을 기기에 저장하세요.");
      return;
    }
    const sessionId = localSessionIdRef.current;
    if (!sessionId) {
      setConfirmationState("complete");
      setConfirmationProgress(100);
      setMessage("로컬에 보관할 대기 음성 청크가 없습니다. 서버에는 최종 전사와 회의록만 저장합니다.");
      return;
    }
    try {
      const chunks = (await readBrowserChunks(sessionId)).filter((chunk) => chunk.uploadStatus !== "UPLOADED");
      setConfirmationState("confirming");
      if (chunks.length === 0) {
        setConfirmationState("complete");
        setConfirmationProgress(100);
        return;
      }
      let confirmed = 0;
      for (const chunk of chunks) {
        await markBrowserChunkConfirmed(chunk);
        confirmed += 1;
        setConfirmedChunks((value) => value + 1);
        setConfirmationProgress(Math.round((confirmed / chunks.length) * 100));
      }
      setConfirmationState("complete");
      setMessage("원본 음성은 이 브라우저에만 보관됩니다. 서버에는 확정 전사와 회의록만 저장하세요.");
    } catch {
      setConfirmationState("failed");
      setMessage("로컬 음성 보관 상태 확인에 실패했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.");
    }
  }, [storageMode]);

  const deleteLocalAudio = useCallback(async () => {
    try {
      await deleteBrowserChunks(localSessionIdRef.current ?? undefined);
    } catch {
      // Memory fallback can still be cleared even if IndexedDB is unavailable.
    }
    chunksRef.current = [];
    qualityFramesRef.current = [];
    replaceFileUrl(null);
    setRecordingFileSize(0);
    setChunkCount(0);
    setStoredBytes(0);
    setConfirmedChunks(0);
    setConfirmationProgress(0);
    setConfirmationState("idle");
    try {
      window.localStorage.removeItem(localSessionStorageKey);
    } catch {
      // Ignore localStorage failures after local audio cleanup.
    }
    setMessage("이 브라우저의 원본 음성 청크와 메모리 임시 보관본을 삭제했습니다.");
  }, [replaceFileUrl]);

  return {
    state,
    elapsedSeconds,
    level,
    message,
    networkState,
    storageMode,
    chunkCount,
    storedBytes,
    confirmedChunks,
    confirmationState,
    confirmationProgress,
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
  };
}
