import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryChunkStorageAdapter,
  S3CompatibleStorageAdapter,
  createRecordingChunkStorageKey,
  createStorageAdapterFromEnv
} from "./index";

describe("recording chunk storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates deterministic chunk keys and stores metadata", async () => {
    const input = {
      organizationId: "org-1",
      meetingId: "meeting-1",
      recordingId: "recording-1",
      chunkId: "chunk-a",
      partNumber: 1,
      sizeBytes: 120,
      mimeType: "audio/webm"
    };
    expect(createRecordingChunkStorageKey(input)).toBe("org-1/meetings/meeting-1/recordings/recording-1/chunks/1-chunk-a");

    const adapter = new MemoryChunkStorageAdapter();
    const uploaded = await adapter.uploadChunk(input);
    expect(uploaded.key).toContain("chunks/1-chunk-a");
    expect(adapter.getUploadedChunks()).toHaveLength(1);
  });

  it("creates S3-compatible signed playback URLs", async () => {
    const adapter = new S3CompatibleStorageAdapter({
      endpoint: "http://localhost:9000",
      region: "local",
      bucket: "meetingloop",
      accessKeyId: "meetingloop",
      secretAccessKey: "meetingloop-secret",
      forcePathStyle: true
    });

    const url = await adapter.createSignedGetUrl({
      bucket: "meetingloop",
      key: "org-1/meetings/meeting-1/recordings/recording-1.webm",
      expiresInSeconds: 900
    });

    expect(url).toContain("http://localhost:9000/meetingloop/org-1/meetings/meeting-1/recordings/recording-1.webm");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Signature=");
  });

  it("selects the S3-compatible adapter from environment", () => {
    const adapter = createStorageAdapterFromEnv({
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "local",
      S3_BUCKET: "meetingloop",
      S3_ACCESS_KEY: "meetingloop",
      S3_SECRET_KEY: "meetingloop-secret"
    });

    expect(adapter).toBeInstanceOf(S3CompatibleStorageAdapter);
  });

  it("uploads chunks through a signed S3-compatible PUT request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new S3CompatibleStorageAdapter({
      endpoint: "http://localhost:9000",
      region: "local",
      bucket: "meetingloop",
      accessKeyId: "meetingloop",
      secretAccessKey: "meetingloop-secret",
      forcePathStyle: true
    });

    const uploaded = await adapter.uploadChunk({
      organizationId: "org-1",
      meetingId: "meeting-1",
      recordingId: "recording-1",
      chunkId: "chunk-a",
      partNumber: 1,
      sizeBytes: 3,
      mimeType: "audio/webm",
      body: new Uint8Array([1, 2, 3]).buffer
    });

    expect(uploaded.key).toBe("org-1/meetings/meeting-1/recordings/recording-1/chunks/1-chunk-a");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("/meetingloop/org-1/meetings/meeting-1/recordings/recording-1/chunks/1-chunk-a")
      }),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("AWS4-HMAC-SHA256"),
          "Content-Type": "audio/webm"
        })
      })
    );
  });
});
