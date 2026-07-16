import { z } from "zod";

export const minutesActionItemSchema = z.object({
  id: z.string().min(1), content: z.string().min(1).max(1000), assignee: z.string().max(80).nullable(),
  dueDate: z.string().nullable(), evidenceSegmentSequence: z.number().int().nonnegative()
});

export const meetingMinutesSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), meetingId: z.string().min(1),
  title: z.string().min(1).max(160), summary: z.string().min(1).max(4000),
  keyPoints: z.array(z.string().min(1).max(1000)).min(1).max(20),
  discussionTopics: z.array(z.string().min(1).max(1000)).max(20),
  decisions: z.array(z.string().min(1).max(1000)).max(20), actionItems: z.array(minutesActionItemSchema).max(30),
  risks: z.array(z.string().min(1).max(1000)).max(20), openQuestions: z.array(z.string().min(1).max(1000)).max(20),
  source: z.enum(["TRANSCRIPT_TEXT"]), status: z.enum(["DRAFT", "CONFIRMED"]), version: z.number().int().nonnegative(),
  createdBy: z.string().min(1), updatedBy: z.string().min(1), createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});

const minutesContentSchema = z.object({
  title: z.string().trim().min(1).max(160), summary: z.string().trim().min(1).max(4000),
  keyPoints: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
  discussionTopics: z.array(z.string().trim().min(1).max(1000)).max(20),
  decisions: z.array(z.string().trim().min(1).max(1000)).max(20), actionItems: z.array(minutesActionItemSchema).max(30),
  risks: z.array(z.string().trim().min(1).max(1000)).max(20), openQuestions: z.array(z.string().trim().min(1).max(1000)).max(20)
});

export const generateMinutesInputSchema = z.object({ organizationId: z.string().min(1), meetingId: z.string().min(1) });

export const saveMinutesInputSchema = generateMinutesInputSchema.extend({
  version: z.number().int().min(0), ...minutesContentSchema.shape
});

export const minutesRevisionSchema = z.object({
  id: z.string().min(1), meetingMinutesId: z.string().min(1), version: z.number().int().positive(),
  snapshot: z.record(z.unknown()), changedBy: z.string().min(1), createdAt: z.string().datetime()
});

export type MeetingMinutes = z.infer<typeof meetingMinutesSchema>;
export type SaveMinutesInput = z.infer<typeof saveMinutesInputSchema>;
export type MinutesRevision = z.infer<typeof minutesRevisionSchema>;
export type MinutesActionItem = z.infer<typeof minutesActionItemSchema>;
export type GenerateMinutesInput = z.infer<typeof generateMinutesInputSchema>;
