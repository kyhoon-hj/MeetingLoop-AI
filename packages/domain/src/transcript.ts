import { z } from "zod";

export const transcriptSegmentSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), meetingId: z.string().min(1),
  sequence: z.number().int().nonnegative(), speakerLabel: z.string().min(1).max(80),
  startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative(),
  editedText: z.string().min(1).max(4000), source: z.enum(["LIVE", "MANUAL", "STT"]),
  status: z.enum(["CONFIRMED", "DELETED"]), editedBy: z.string().min(1),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});

export const transcriptSegmentInputSchema = z.object({
  clientId: z.string().min(1).max(120), sequence: z.number().int().nonnegative(),
  speakerLabel: z.string().min(1).max(80), startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative(),
  editedText: z.string().min(1).max(4000), source: z.enum(["LIVE", "MANUAL", "STT"]).default("MANUAL"),
  status: z.literal("CONFIRMED").default("CONFIRMED")
}).strict();

export const saveTranscriptSegmentsInputSchema = z.object({
  organizationId: z.string().min(1), meetingId: z.string().min(1),
  segments: z.array(transcriptSegmentInputSchema).min(1).max(200)
});

export const finalTranscriptSegmentInputSchema = z.object({
  sequence: z.number().int().nonnegative(), speakerLabel: z.string().trim().min(1).max(80),
  startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative(),
  editedText: z.string().trim().min(1).max(4000), source: z.enum(["LIVE", "MANUAL", "STT"]).default("MANUAL")
}).strict().refine((segment) => segment.endMs >= segment.startMs, {
  message: "TRANSCRIPT_SEGMENT_TIME_INVALID", path: ["endMs"]
});

export const saveTranscriptInputSchema = z.object({
  organizationId: z.string().min(1), meetingId: z.string().min(1), version: z.number().int().min(0),
  segments: z.array(finalTranscriptSegmentInputSchema).min(1).max(200)
}).strict().superRefine((input, context) => {
  const sequences = new Set<number>();
  let textLength = 0;
  for (const [index, segment] of input.segments.entries()) {
    if (sequences.has(segment.sequence)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "TRANSCRIPT_SEQUENCE_DUPLICATED", path: ["segments", index, "sequence"] });
    }
    sequences.add(segment.sequence);
    textLength += segment.editedText.length;
  }
  if (textLength > 200_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "TRANSCRIPT_TEXT_TOO_LARGE", path: ["segments"] });
  }
});

export const transcriptDocumentSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), meetingId: z.string().min(1),
  status: z.literal("CONFIRMED"), version: z.number().int().positive(), confirmedBy: z.string().min(1),
  confirmedAt: z.string().datetime(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  segments: z.array(transcriptSegmentSchema)
});

export const transcriptRevisionSchema = z.object({
  id: z.string().min(1), transcriptId: z.string().min(1), version: z.number().int().positive(),
  snapshot: z.record(z.unknown()), changedBy: z.string().min(1), createdAt: z.string().datetime()
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type SaveTranscriptSegmentsInput = z.infer<typeof saveTranscriptSegmentsInputSchema>;
export type FinalTranscriptSegmentInput = z.infer<typeof finalTranscriptSegmentInputSchema>;
export type SaveTranscriptInput = z.infer<typeof saveTranscriptInputSchema>;
export type TranscriptDocument = z.infer<typeof transcriptDocumentSchema>;
export type TranscriptRevision = z.infer<typeof transcriptRevisionSchema>;
