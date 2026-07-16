import {
  audioNormalizationInputSchema,
  audioNormalizationResultSchema,
  audioQualityAnalysisInputSchema,
  audioQualityReportSchema,
  diarizationInputSchema,
  diarizationResultSchema,
  forcedAlignmentInputSchema,
  meetingReviewAnalysisInputSchema,
  meetingReviewAnalysisResultSchema,
  overlapAnalysisInputSchema,
  overlapAnalysisResultSchema,
  preciseCandidateSelectionInputSchema,
  preciseCandidateSelectionResultSchema,
  quickTranscriptionInputSchema,
  quickTranscriptionResultSchema,
  sourceSeparationInputSchema,
  sourceSeparationResultSchema,
  statementConfidenceThreshold,
  vadAnalysisInputSchema,
  vadAnalysisResultSchema,
  type AudioNormalizationInput,
  type AudioNormalizationResult,
  type AudioQualityAnalysisInput,
  type AudioQualityReport,
  type DiarizationInput,
  type DiarizationResult,
  type EvidenceLink,
  type ExtractedItem,
  type ForcedAlignmentInput,
  type MeetingReviewAnalysisInput,
  type MeetingReviewAnalysisResult,
  type OverlapAnalysisInput,
  type OverlapAnalysisResult,
  type OverlapSeverity,
  type PreciseAnalysisReason,
  type PreciseCandidateSelectionInput,
  type PreciseCandidateSelectionResult,
  type QuickTranscriptionInput,
  type QuickTranscriptionResult,
  type SegmentSpeakerAssignment,
  type SourceSeparationInput,
  type SourceSeparationResult,
  type StatementType,
  type TranscriptDraftSegment,
  type TranscriptWord,
  type VadAnalysisInput,
  type VadAnalysisResult,
  type VoiceRegion
} from "@meetingloop/domain";
import { browserDeterministicCapability, type ProviderCapability } from "./provider-capabilities";

const thresholds = { silenceRms: 0.012, lowVolumeRms: 0.04, clippingPeak: 0.985, noiseZcr: 0.36 } as const;
const ratio = (value: number, total: number) => total <= 0 ? 0 : Math.round((value / total) * 10_000) / 10_000;
const now = () => new Date().toISOString();

interface DeterministicProvider {
  readonly kind: "mock";
  readonly capability: ProviderCapability;
}

export class DeterministicAudioQualityProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly version = "deterministic-frame-quality-v1";
  readonly capability = browserDeterministicCapability(this.version);

  async analyze(input: AudioQualityAnalysisInput): Promise<AudioQualityReport> {
    const parsed = audioQualityAnalysisInputSchema.parse(input);
    let silence = 0, low = 0, clipping = 0, noise = 0, total = 0;
    for (const frame of parsed.frames) {
      const duration = Math.max(1, frame.endMs - frame.startMs);
      total += duration;
      const silent = frame.rms < thresholds.silenceRms;
      if (silent) silence += duration;
      if (!silent && frame.rms < thresholds.lowVolumeRms) low += duration;
      if (frame.peak >= thresholds.clippingPeak) clipping += duration;
      if (!silent && frame.zeroCrossingRate >= thresholds.noiseZcr) noise += duration;
    }
    const silenceRatio = ratio(silence, total);
    const lowVolumeRatio = ratio(low, total);
    const clippingRatio = ratio(clipping, total);
    const noiseRatio = ratio(noise, total);
    const score = Math.max(0, Math.min(100, Math.round(100 - silenceRatio * 30 - lowVolumeRatio * 24 - clippingRatio * 48 - noiseRatio * 34)));
    const recommendations: string[] = [];
    if (silenceRatio > 0.55) recommendations.push("마이크 권한과 입력 장치를 확인하세요.");
    if (lowVolumeRatio > 0.3) recommendations.push("마이크를 20~40cm 거리로 옮겨 주세요.");
    if (clippingRatio > 0.03) recommendations.push("입력 음량을 낮춰 왜곡을 줄여 주세요.");
    if (noiseRatio > 0.2) recommendations.push("조용한 장소나 헤드셋 마이크를 권장합니다.");
    if (recommendations.length === 0) recommendations.push("현재 입력 품질이 안정적입니다.");
    return audioQualityReportSchema.parse({
      id: `${parsed.recordingId}-quality`, organizationId: parsed.organizationId, meetingId: parsed.meetingId,
      recordingId: parsed.recordingId, source: parsed.source, durationMs: parsed.durationMs,
      sampleRate: parsed.sampleRate, channelCount: parsed.channelCount,
      speechRatio: Math.max(0, 1 - silenceRatio - noiseRatio), silenceRatio, lowVolumeRatio, clippingRatio, noiseRatio,
      overlapRatio: 0, echoScore: null, reverberationScore: null, overallScore: score,
      recommendPreciseAnalysis: score < 75, recommendations, analyzerVersion: this.version,
      metricsJson: { analyzedDurationMs: total, frameCount: parsed.frames.length, thresholds }, createdAt: now()
    });
  }
}

const normalizedBrowserKey = (input: AudioNormalizationInput) =>
  `${input.sourceBrowserKey}.derived/normalized.wav`;

export function buildFfmpegNormalizationArguments(input: AudioNormalizationInput): string[] {
  const parsed = audioNormalizationInputSchema.parse(input);
  const filters = ["highpass=f=80", "loudnorm=I=-16:TP=-1.5:LRA=11"];
  if (parsed.enableNoiseReduction) filters.push("afftdn=nf=-25");
  return ["-hide_banner", "-y", "-i", parsed.sourceBrowserKey, "-vn", "-ac", "1", "-ar",
    String(parsed.targetSampleRate), "-af", filters.join(","), "-c:a", "pcm_s16le", normalizedBrowserKey(parsed)];
}

export class DeterministicAudioNormalizationProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly version = "deterministic-normalization-v1";
  readonly capability = browserDeterministicCapability(this.version);
  constructor(private readonly simulateFailure = false) {}

  async normalize(input: AudioNormalizationInput): Promise<AudioNormalizationResult> {
    const parsed = audioNormalizationInputSchema.parse(input);
    const createdAt = now();
    const originalArtifact = {
      id: `${parsed.recordingId}-artifact-original`, organizationId: parsed.organizationId, meetingId: parsed.meetingId,
      recordingId: parsed.recordingId, kind: "ORIGINAL" as const, browserKey: parsed.sourceBrowserKey,
      mimeType: parsed.originalMimeType, durationMs: parsed.durationMs, sampleRate: parsed.sampleRate,
      channelCount: parsed.channelCount, retentionUntil: null, createdAt
    };
    const common = {
      recordingId: parsed.recordingId, originalArtifact, inputMetrics: parsed.inputMetrics,
      timeMappings: [{ sourceStartMs: 0, sourceEndMs: parsed.durationMs, artifactStartMs: 0, artifactEndMs: parsed.durationMs }],
      ffmpegArguments: buildFfmpegNormalizationArguments(parsed), createdAt
    };
    if (this.simulateFailure) return audioNormalizationResultSchema.parse({
      ...common, status: "FALLBACK", analysisArtifact: originalArtifact, steps: ["STANDARDIZE_PCM"],
      outputMetrics: parsed.inputMetrics, fallbackUsed: true, warning: "정규화 실패로 브라우저 원본을 유지했습니다."
    });
    const steps: AudioNormalizationResult["steps"] = ["STANDARDIZE_PCM", "LOUDNESS_NORMALIZE"];
    if (parsed.enableNoiseReduction) steps.push("NOISE_REDUCTION");
    if (parsed.enableDereverberation) steps.push("DEREVERBERATION");
    return audioNormalizationResultSchema.parse({
      ...common, status: "COMPLETED", steps, analysisArtifact: {
        ...originalArtifact, id: `${parsed.recordingId}-artifact-normalized`,
        kind: parsed.enableDereverberation ? "DEREVERBERATED" : parsed.enableNoiseReduction ? "NOISE_REDUCED" : "NORMALIZED",
        browserKey: normalizedBrowserKey(parsed), mimeType: "audio/wav", sampleRate: parsed.targetSampleRate, channelCount: 1,
        retentionUntil: new Date(Date.parse(createdAt) + 86_400_000).toISOString()
      },
      outputMetrics: { integratedLufs: -16, truePeakDb: Math.min(-1.5, parsed.inputMetrics.truePeakDb),
        noiseFloorDb: parsed.enableNoiseReduction ? Math.max(-120, parsed.inputMetrics.noiseFloorDb - 8) : parsed.inputMetrics.noiseFloorDb },
      fallbackUsed: false, warning: null
    });
  }
}

type RegionDraft = Pick<VoiceRegion, "startMs" | "endMs" | "classification" | "confidence">;

export class DeterministicVadProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly version = "deterministic-vad-v1";
  readonly capability = browserDeterministicCapability(this.version);
  async detect(input: VadAnalysisInput): Promise<VadAnalysisResult> {
    const parsed = vadAnalysisInputSchema.parse(input);
    const drafts: RegionDraft[] = [];
    for (const frame of [...parsed.frames].sort((a, b) => a.startMs - b.startMs)) {
      const classification: RegionDraft["classification"] = frame.rms < thresholds.silenceRms ? "SILENCE" : frame.zeroCrossingRate >= thresholds.noiseZcr ? "NOISE" : "VOICE";
      const previous = drafts.at(-1);
      if (previous && previous.classification === classification && previous.endMs === frame.startMs) previous.endMs = frame.endMs;
      else drafts.push({ startMs: frame.startMs, endMs: frame.endMs, classification, confidence: classification === "SILENCE" ? 0.99 : 0.86 });
    }
    const createdAt = now();
    const regions = drafts.map((region, index) => ({ id: `${parsed.recordingId}-region-${index + 1}`,
      organizationId: parsed.organizationId, meetingId: parsed.meetingId, recordingId: parsed.recordingId,
      ...region, provider: this.version, createdAt }));
    const total = regions.reduce((sum, r) => sum + r.endMs - r.startMs, 0);
    const duration = (value: VoiceRegion["classification"]) => regions.filter((r) => r.classification === value).reduce((sum, r) => sum + r.endMs - r.startMs, 0);
    return vadAnalysisResultSchema.parse({ recordingId: parsed.recordingId, provider: this.version, regions,
      speechRatio: ratio(duration("VOICE"), total), silenceRatio: ratio(duration("SILENCE"), total),
      noiseRatio: ratio(duration("NOISE"), total), createdAt });
  }
}

export class DeterministicOverlapProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly version = "deterministic-overlap-candidate-v1";
  readonly capability = browserDeterministicCapability(this.version);
  async detect(input: OverlapAnalysisInput): Promise<OverlapAnalysisResult> {
    const parsed = overlapAnalysisInputSchema.parse(input);
    const createdAt = now();
    const frames = parsed.frames.filter((frame) => (frame.overlapProbability ?? (frame.rms >= 0.08 ? 0.7 : 0)) >= 0.35);
    const regions = frames.map((frame, index) => {
      const confidence = frame.overlapProbability ?? Math.min(0.95, 0.4 + frame.rms * 5);
      const severity: OverlapSeverity = confidence >= 0.8 ? "HIGH" : confidence >= 0.55 ? "MEDIUM" : "LOW";
      return { id: `${parsed.recordingId}-overlap-${index + 1}`, organizationId: parsed.organizationId,
        meetingId: parsed.meetingId, recordingId: parsed.recordingId, startMs: frame.startMs, endMs: frame.endMs,
        severity, estimatedSpeakerCount: 2, confidence, reviewStatus: "PENDING" as const,
        decisionEvidenceAllowed: false, provider: this.version, createdAt };
    });
    const total = parsed.frames.reduce((sum, f) => sum + f.endMs - f.startMs, 0);
    return overlapAnalysisResultSchema.parse({ recordingId: parsed.recordingId, provider: this.version, regions,
      overlapRatio: ratio(regions.reduce((sum, r) => sum + r.endMs - r.startMs, 0), total),
      highReviewCount: regions.filter((r) => r.severity === "HIGH").length, createdAt });
  }
}

export class DeterministicDiarizationProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly version = "deterministic-diarization-v1";
  readonly capability = browserDeterministicCapability(this.version);
  async diarize(input: DiarizationInput): Promise<DiarizationResult> {
    const parsed = diarizationInputSchema.parse(input);
    const createdAt = now();
    const count = Math.max(1, Math.min(8, parsed.expectedSpeakerCount));
    const clusters = Array.from({ length: count }, (_, index) => ({
      id: `${parsed.recordingId}-speaker-${index + 1}`, organizationId: parsed.organizationId,
      meetingId: parsed.meetingId, recordingId: parsed.recordingId, label: `Speaker ${String.fromCharCode(65 + index)}`,
      confidence: 0.72, representativeRegionIds: parsed.voiceRegions.filter((r) => r.classification === "VOICE").slice(index, index + 3).map((r) => r.id),
      status: "ACTIVE" as const, createdAt, updatedAt: createdAt
    }));
    const assignments: SegmentSpeakerAssignment[] = parsed.voiceRegions.map((region, index) => {
      const cluster = clusters[index % clusters.length]!;
      const overlapped = parsed.overlapRegions.some((candidate) => candidate.startMs < region.endMs && candidate.endMs > region.startMs);
      return { id: `${region.id}-assignment`, segmentId: region.id, speakerClusterId: cluster.id, participantId: null,
        speakerLabel: overlapped ? "Multiple Speakers" : cluster.label,
        assignmentRole: overlapped ? "MULTIPLE" : "PRIMARY", confidence: overlapped ? 0.55 : 0.72,
        status: "UNCONFIRMED", source: "DIARIZATION", persistence: "BROWSER_ONLY", createdAt, updatedAt: createdAt };
    });
    return diarizationResultSchema.parse({ recordingId: parsed.recordingId, provider: this.version, clusters, assignments,
      suggestions: parsed.overlapRegions.filter((r) => r.severity === "HIGH").map((r) => ({ id: `${r.id}-split`, type: "SPLIT",
        clusterIds: clusters.slice(0, 2).map((c) => c.id), reason: "HIGH 겹침 구간의 화자 분할을 확인하세요.", confidence: r.confidence, status: "PENDING" })),
      history: assignments.map((assignment) => ({ id: `${assignment.id}-event`, meetingId: parsed.meetingId,
        recordingId: parsed.recordingId, assignmentId: assignment.id, eventType: "DETECTED", previousClusterId: null,
        nextClusterId: assignment.speakerClusterId, actorId: null, createdAt })), createdAt });
  }
}

const overlaps = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) => a.startMs < b.endMs && a.endMs > b.startMs;

export class DeterministicQuickTranscriptionProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly model = "deterministic-quick-stt-v1";
  readonly capability = browserDeterministicCapability(this.model);
  async transcribeQuick(input: QuickTranscriptionInput): Promise<QuickTranscriptionResult> {
    const parsed = quickTranscriptionInputSchema.parse(input);
    const createdAt = now();
    const regions = parsed.voiceRegions.filter((r) => r.classification === "VOICE");
    const source = regions.length ? regions : parsed.voiceRegions.slice(0, 1);
    const build = (processed: boolean) => source.map((region, sequence) => {
      const assignment = parsed.speakerAssignments.find((a) => a.segmentId === region.id);
      const overlap = parsed.overlapRegions.find((candidate) => overlaps(region, candidate));
      const rawText = sequence % 2 ? "담당자는 금요일까지 검토 합니다" : "회의 주요 안건을 확인 합니다";
      return { id: `${region.id}-${processed ? "processed" : "raw"}`, sequence,
        startMs: Math.max(0, region.startMs - parsed.contextWindowMs), endMs: region.endMs + parsed.contextWindowMs,
        speakerLabel: assignment?.speakerLabel ?? "Unknown", rawText,
        normalizedText: processed ? rawText.replace("검토 합니다", "검토합니다").replace("확인 합니다", "확인합니다") : rawText,
        confidence: processed ? 0.86 : 0.74, overlapSeverity: overlap?.severity ?? null,
        speakerStatus: assignment?.status ?? "UNCONFIRMED" };
    });
    const makeRun = (kind: "QUICK_RAW" | "QUICK_PROCESSED", processed: boolean) => ({
      id: `${parsed.recordingId}-${kind.toLowerCase()}`, organizationId: parsed.organizationId, meetingId: parsed.meetingId,
      recordingId: parsed.recordingId, kind, provider: this.kind, model: this.model,
      inputArtifactId: processed ? parsed.processedArtifactId : parsed.rawArtifactId,
      contextBeforeMs: parsed.contextWindowMs, contextAfterMs: parsed.contextWindowMs, status: "SUCCEEDED" as const,
      confidence: processed ? 0.86 : 0.74, selected: processed, errorCode: null, segments: build(processed), createdAt, updatedAt: createdAt
    });
    const runs = [makeRun("QUICK_RAW", false), makeRun("QUICK_PROCESSED", true)];
    return quickTranscriptionResultSchema.parse({ recordingId: parsed.recordingId, runs, selectedRunId: runs[1]!.id,
      state: "QUICK_ANALYSIS_READY", createdAt });
  }
}

const reasonWeight: Record<PreciseAnalysisReason, number> = {
  LOW_STT_CONFIDENCE: 0.18, OVERLAP_MEDIUM_HIGH: 0.24, LOW_SPEAKER_CONFIDENCE: 0.18,
  IMPORTANT_KEYWORD: 0.12, DECISION_CANDIDATE: 0.2, ASSIGNEE_DEADLINE_CANDIDATE: 0.16, USER_REQUESTED: 0.3
};

export class DeterministicPreciseCandidateSelector implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly capability = browserDeterministicCapability("deterministic-precise-selector-v1");
  async select(input: PreciseCandidateSelectionInput): Promise<PreciseCandidateSelectionResult> {
    const parsed = preciseCandidateSelectionInputSchema.parse(input);
    const createdAt = now();
    const totalDurationMs = parsed.segments.reduce((sum, s) => sum + s.endMs - s.startMs, 0);
    const budgetMs = Math.floor(totalDurationMs * parsed.maxAnalysisRatio);
    let selectedDurationMs = 0;
    const candidates = parsed.segments.flatMap((segment) => {
      const reasons: PreciseAnalysisReason[] = [];
      if (segment.confidence < 0.7) reasons.push("LOW_STT_CONFIDENCE");
      if (segment.overlapSeverity === "MEDIUM" || segment.overlapSeverity === "HIGH") reasons.push("OVERLAP_MEDIUM_HIGH");
      if (segment.speakerStatus === "UNCONFIRMED") reasons.push("LOW_SPEAKER_CONFIDENCE");
      if (/결정|확정/.test(segment.normalizedText)) reasons.push("DECISION_CANDIDATE");
      if (/담당|까지/.test(segment.normalizedText)) reasons.push("ASSIGNEE_DEADLINE_CANDIDATE");
      if (parsed.userRequestedSegmentIds.includes(segment.id)) reasons.push("USER_REQUESTED");
      if (!reasons.length) return [];
      const duration = segment.endMs - segment.startMs;
      const selected = selectedDurationMs < budgetMs;
      const used = selected ? Math.min(duration, budgetMs - selectedDurationMs) : 0;
      selectedDurationMs += used;
      return [{ id: `${parsed.recordingId}-precise-${segment.sequence}`, organizationId: parsed.organizationId,
        meetingId: parsed.meetingId, recordingId: parsed.recordingId, segmentId: segment.id,
        startMs: segment.startMs, endMs: selected ? segment.startMs + used : segment.endMs,
        priority: reasons.includes("USER_REQUESTED") || reasons.includes("DECISION_CANDIDATE") ? "HIGH" as const : "NORMAL" as const,
        score: Math.min(1, 0.35 + reasons.reduce((sum, reason) => sum + reasonWeight[reason], 0)), reasons,
        estimatedCostUnits: Math.max(1, Math.ceil(duration / 1000)), status: selected ? "SELECTED" as const : "DEFERRED" as const, createdAt }];
    });
    return preciseCandidateSelectionResultSchema.parse({ recordingId: parsed.recordingId, candidates, selectedDurationMs,
      totalDurationMs, selectedRatio: selectedDurationMs / totalDurationMs,
      deferredCount: candidates.filter((c) => c.status === "DEFERRED").length, createdAt });
  }
}

export class DeterministicSourceSeparationProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly model = "deterministic-source-separation-v1";
  readonly capability = browserDeterministicCapability(this.model);
  async separate(input: SourceSeparationInput): Promise<SourceSeparationResult> {
    const parsed = sourceSeparationInputSchema.parse(input);
    const createdAt = now();
    const expiresAt = new Date(Date.parse(createdAt) + parsed.retentionHours * 3_600_000).toISOString();
    const extractedStartMs = Math.max(0, parsed.overlapRegion.startMs - parsed.contextPaddingMs);
    const extractedEndMs = Math.min(parsed.sourceDurationMs, parsed.overlapRegion.endMs + parsed.contextPaddingMs);
    if (parsed.simulateFailure) return sourceSeparationResultSchema.parse({ recordingId: parsed.recordingId,
      overlapRegionId: parsed.overlapRegion.id, provider: this.model, status: "FALLBACK", extractedStartMs, extractedEndMs,
      tracks: [], candidateConfidence: 0, preferredResult: "ORIGINAL", autoSpeakerConfirmed: false,
      fallbackRunId: `${parsed.recordingId}-quick_processed`, warning: "분리 실패로 원본 후보를 유지했습니다.", expiresAt, createdAt });
    const tracks = (["A", "B"] as const).map((label, index) => ({ label, artifact: {
      id: `${parsed.overlapRegion.id}-track-${label.toLowerCase()}`, organizationId: parsed.organizationId,
      meetingId: parsed.meetingId, recordingId: parsed.recordingId, kind: "SEPARATED_TRACK" as const,
      browserKey: `${parsed.sourceBrowserKey}.derived/${parsed.overlapRegion.id}/track-${label.toLowerCase()}.wav`,
      mimeType: "audio/wav", durationMs: extractedEndMs - extractedStartMs, sampleRate: 16000, channelCount: 1,
      retentionUntil: expiresAt, createdAt }, candidateText: `${label} 화자의 겹침 발화 후보입니다.`,
      confidence: index === 0 ? 0.76 : 0.72, speakerStatus: "UNCONFIRMED" as const }));
    return sourceSeparationResultSchema.parse({ recordingId: parsed.recordingId, overlapRegionId: parsed.overlapRegion.id,
      provider: this.model, status: "COMPLETED", extractedStartMs, extractedEndMs, tracks,
      candidateConfidence: 0.74, preferredResult: "SEPARATED_CANDIDATE", autoSpeakerConfirmed: false,
      fallbackRunId: `${parsed.recordingId}-quick_processed`, warning: "사용자 확인 전에는 결정 근거로 사용하지 않습니다.", expiresAt, createdAt });
  }
}

export class DeterministicForcedAlignmentProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly model = "deterministic-forced-alignment-v1";
  readonly capability = browserDeterministicCapability(this.model);
  async align(input: ForcedAlignmentInput): Promise<TranscriptWord[]> {
    const parsed = forcedAlignmentInputSchema.parse(input);
    return parsed.run.segments.flatMap((segment) => {
      const tokens = segment.normalizedText.trim().split(/\s+/).filter(Boolean);
      const duration = segment.endMs - segment.startMs;
      return tokens.map((text, sequence) => {
        const startMs = segment.startMs + Math.floor(duration * sequence / tokens.length);
        const endMs = segment.startMs + Math.floor(duration * (sequence + 1) / tokens.length);
        const confidence = Math.max(0.35, segment.confidence - (sequence % 4 === 3 ? 0.28 : 0.02));
        return { id: `${segment.id}-word-${sequence + 1}`, segmentId: segment.id, sequence, text, startMs,
          endMs: Math.max(startMs + 1, endMs), confidence, speakerClusterId: null,
          isUncertain: confidence < parsed.uncertainThreshold || segment.overlapSeverity === "HIGH" };
      });
    });
  }
}

const reviewTypes = new Set<StatementType>(["PROPOSAL", "RISK", "DECISION", "DEFERRED", "REJECTED", "ACTION_ITEM", "OPEN_QUESTION"]);
const classify = (text: string): StatementType => {
  if (/(결정|확정|합의)/.test(text)) return "DECISION";
  if (/(담당|까지\s*(완료|제출)|해주세요)/.test(text)) return "ACTION_ITEM";
  if (/(리스크|위험|우려)/.test(text)) return "RISK";
  if (/\?/.test(text)) return "QUESTION";
  return "BACKGROUND";
};
const overlapRisk = (segment: TranscriptDraftSegment): ExtractedItem["overlapRiskLevel"] =>
  segment.overlapSeverity === "HIGH" ? "HIGH" : segment.overlapSeverity === "MEDIUM" ? "MEDIUM" : "LOW";

export class DeterministicMeetingReviewProvider implements DeterministicProvider {
  readonly kind = "mock" as const;
  readonly version = "deterministic-meeting-review-v1";
  readonly capability = browserDeterministicCapability(this.version);
  async analyze(input: MeetingReviewAnalysisInput): Promise<MeetingReviewAnalysisResult> {
    const parsed = meetingReviewAnalysisInputSchema.parse(input);
    const createdAt = now();
    const items: ExtractedItem[] = [];
    const evidenceLinks: EvidenceLink[] = [];
    for (const segment of parsed.segments) {
      const type = classify(segment.editedText);
      const transcriptionConfidence = segment.confidence ?? (segment.source === "MANUAL" ? 0.98 : 0.72);
      const overlapFactor = segment.overlapSeverity === "HIGH" ? 0.38 : segment.overlapSeverity === "MEDIUM" ? 0.68 : 1;
      const speakerFactor = segment.speakerStatus === "UNCONFIRMED" ? 0.45 : 1;
      const confidence = Math.min(transcriptionConfidence, overlapFactor, speakerFactor);
      const id = `${parsed.meetingId}-item-${segment.sequence}`;
      const item: ExtractedItem = { id, organizationId: parsed.organizationId, meetingId: parsed.meetingId, agendaId: null,
        type, title: segment.editedText.slice(0, 200), content: segment.editedText, assigneeParticipantId: null,
        assigneeText: null, dueDate: null, dueDateExpression: null, confidence, reviewStatus: "PENDING",
        audioRiskLevel: transcriptionConfidence < 0.65 ? "HIGH" : transcriptionConfidence < 0.8 ? "MEDIUM" : "LOW",
        speakerRiskLevel: segment.speakerStatus === "UNCONFIRMED" ? "HIGH" : "LOW", overlapRiskLevel: overlapRisk(segment),
        persistence: "BROWSER_ONLY", createdAt, updatedAt: createdAt };
      const requiresHumanReview = reviewTypes.has(type) || segment.overlapSeverity !== null ||
        segment.speakerStatus === "UNCONFIRMED" || confidence < statementConfidenceThreshold(type);
      items.push(item);
      evidenceLinks.push({ id: `${id}-evidence`, organizationId: parsed.organizationId, meetingId: parsed.meetingId,
        entityType: "EXTRACTED_ITEM", entityId: id, segmentId: segment.id, startMs: segment.startMs, endMs: segment.endMs,
        evidenceText: segment.rawText, evidenceConfidence: confidence, validationStatus: "PENDING", requiresHumanReview,
        validatedBy: null, validatedAt: null, persistence: "BROWSER_ONLY", createdAt });
    }
    return meetingReviewAnalysisResultSchema.parse({ items, evidenceLinks, provider: this.version, createdAt });
  }
}
