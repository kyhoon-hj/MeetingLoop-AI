"use client";

import type { AudioQualityReport } from "@meetingloop/domain";
import type { InputTestState } from "./useBrowserRecording";

interface AudioQualityPanelProps {
  level: number;
  inputTestState: InputTestState;
  inputTestRemainingMs: number;
  inputTestReport: AudioQualityReport | null;
  recordingQualityReport: AudioQualityReport | null;
  qualityMessage: string;
  isAnalyzingQuality: boolean;
  disabled: boolean;
  onRunInputTest(): void;
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function qualityAccessibilityText(report: AudioQualityReport | null, fallback: string): string {
  if (!report) return fallback;
  return [
    `입력 품질 ${report.overallScore}점`,
    `무음 ${formatRatio(report.silenceRatio)}`,
    `저음량 ${formatRatio(report.lowVolumeRatio)}`,
    `왜곡 ${formatRatio(report.clippingRatio)}`,
    `소음 후보 ${formatRatio(report.noiseRatio)}`,
    ...report.recommendations
  ].join(". ");
}

export default function AudioQualityPanel(props: AudioQualityPanelProps) {
  return (
    <>
      <div className="level-meter" aria-label={`입력 레벨 ${props.level}%`}>
        <span style={{ width: `${props.level}%` }} />
      </div>
      <div className="input-test-row">
        <button
          className="button secondary"
          type="button"
          onClick={props.onRunInputTest}
          disabled={props.disabled || props.inputTestState === "running"}
        >
          {props.inputTestState === "running"
            ? `점검 중 ${Math.max(1, Math.ceil(props.inputTestRemainingMs / 1_000))}초`
            : "마이크 5초 점검"}
        </button>
        <div className="input-test-status" role="status" aria-live="polite">
          <span className="sr-only">{qualityAccessibilityText(props.inputTestReport, props.qualityMessage)}</span>
          {props.inputTestReport ? (
            <>
              <strong>입력 품질 {props.inputTestReport.overallScore}점</strong>
              <span>저음량 {formatRatio(props.inputTestReport.lowVolumeRatio)}</span>
              <span>무음 {formatRatio(props.inputTestReport.silenceRatio)}</span>
              <span>왜곡 {formatRatio(props.inputTestReport.clippingRatio)}</span>
              <span>소음 후보 {formatRatio(props.inputTestReport.noiseRatio)}</span>
            </>
          ) : <span aria-hidden="true">{props.qualityMessage}</span>}
        </div>
      </div>
      {props.isAnalyzingQuality || props.recordingQualityReport ? (
        <section className="recording-quality-summary" aria-label="녹음 품질 리포트">
          <div className="quality-summary-heading">
            <strong>{props.isAnalyzingQuality ? "녹음 품질 분석 중" : `녹음 품질 ${props.recordingQualityReport?.overallScore ?? 0}점`}</strong>
            {props.recordingQualityReport ? (
              <span>{props.recordingQualityReport.recommendPreciseAnalysis ? "품질 조정 권장" : "입력 안정"}</span>
            ) : null}
          </div>
          {props.recordingQualityReport ? (
            <>
              <div className="quality-metrics">
                <span>음성 {formatRatio(props.recordingQualityReport.speechRatio)}</span>
                <span>무음 {formatRatio(props.recordingQualityReport.silenceRatio)}</span>
                <span>저음량 {formatRatio(props.recordingQualityReport.lowVolumeRatio)}</span>
                <span>왜곡 {formatRatio(props.recordingQualityReport.clippingRatio)}</span>
                <span>소음 후보 {formatRatio(props.recordingQualityReport.noiseRatio)}</span>
                <span>{props.recordingQualityReport.sampleRate.toLocaleString("ko-KR")}Hz · {props.recordingQualityReport.channelCount}ch</span>
              </div>
              <p>{props.recordingQualityReport.recommendations.join(" ")}</p>
              <small>이 리포트와 분석 frame은 현재 브라우저에만 존재하며 서버로 전송되지 않습니다.</small>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
