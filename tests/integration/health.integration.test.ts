import { describe, expect, it } from "vitest";
import { createMockMeetingPipeline } from "../../packages/ai/src";
import { getDatabaseHealth, getDemoProjectForOrganization } from "../../packages/db/src";
import { createIdempotencyKey } from "../../packages/queue/src";

describe("phase 0 health integration", () => {
  it("connects db health, mock ai, and queue idempotency contracts", async () => {
    const db = getDatabaseHealth({ DATABASE_URL: "postgresql://example" } as NodeJS.ProcessEnv);
    const pipeline = createMockMeetingPipeline();
    const transcript = await pipeline.speechToText.transcribe({ recordingId: "integration-recording" });
    const analysis = await pipeline.analysis.analyzeMeeting({ meetingId: "integration-meeting", transcript });

    expect(db.status).toBe("ok");
    expect(createIdempotencyKey({ meetingId: "integration-meeting", type: "meeting.extract" })).toBe("integration-meeting:meeting.extract");
    expect(analysis.decisions[0]?.evidenceSegmentSequence).toBeGreaterThanOrEqual(0);
  });

  it("blocks direct project access across organizations", async () => {
    await expect(getDemoProjectForOrganization("org-demo", "project-external")).rejects.toThrow("ORGANIZATION_SCOPE_VIOLATION");
  });
});
