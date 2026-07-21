import { describe, expect, it } from "vitest";
import { newestFirstTranscriptSegments } from "./TranscriptEditor";

describe("transcript display order", () => {
  it("shows the most recently appended TXT segment first without changing storage order", () => {
    const stored = [
      { id: "segment-1", text: "첫 문장" },
      { id: "segment-2", text: "최근 문장" }
    ];

    expect(newestFirstTranscriptSegments(stored).map((segment) => segment.id)).toEqual([
      "segment-2",
      "segment-1"
    ]);
    expect(stored.map((segment) => segment.id)).toEqual(["segment-1", "segment-2"]);
  });
});
