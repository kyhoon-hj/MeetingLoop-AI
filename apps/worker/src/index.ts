import { createMockMeetingPipeline } from "@meetingloop/ai";
import { createIdempotencyKey } from "@meetingloop/queue";

export async function getWorkerHealth() {
  const pipeline = createMockMeetingPipeline();
  const transcript = await pipeline.speechToText.transcribe({ recordingId: "worker-health" });

  return {
    status: "ok",
    worker: "meetingloop-worker",
    queueMode: process.env.REDIS_URL ? "redis-configured" : "local-placeholder",
    idempotencyKey: createIdempotencyKey({ meetingId: "health-meeting", type: "audio.transcribe" }),
    mockTranscriptSegments: transcript.length
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getWorkerHealth()
    .then((health) => {
      console.log(JSON.stringify(health, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
