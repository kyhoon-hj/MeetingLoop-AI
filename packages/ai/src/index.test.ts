import { describe, expect, it } from "vitest";
import { createMockMeetingPipeline } from "./index";

describe("mock meeting pipeline", () => {
  it("returns deterministic transcript and evidence-backed decisions", async () => {
    const pipeline = createMockMeetingPipeline();
    const transcript = await pipeline.speechToText.transcribe({ recordingId: "recording-1" });
    const analysis = await pipeline.analysis.analyzeMeeting({ meetingId: "meeting-1", transcript });

    expect(transcript).toHaveLength(2);
    expect(analysis.titleCandidates).toHaveLength(3);
    expect(analysis.decisions[0]?.evidenceSegmentSequence).toBe(1);
  });
});
