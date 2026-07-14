export type ProcessingJobType =
  | "audio.normalize"
  | "audio.transcribe"
  | "audio.diarize"
  | "transcript.normalize"
  | "meeting.extract"
  | "title.generate"
  | "minutes.generate"
  | "weekly.generate"
  | "impact.analyze"
  | "export.render";

export interface ProcessingJobDescriptor {
  idempotencyKey: string;
  meetingId: string;
  type: ProcessingJobType;
}

export function createIdempotencyKey(job: Omit<ProcessingJobDescriptor, "idempotencyKey">): string {
  return `${job.meetingId}:${job.type}`;
}
