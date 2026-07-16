import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = process.cwd();

describe("data storage policy", () => {
  it("does not expose raw audio upload or playback API routes", async () => {
    const forbiddenRoutes = [
      "apps/web/app/api/recordings/chunks/route.ts",
      "apps/web/app/api/recordings/playback-url/route.ts",
      "apps/web/app/api/recordings/analyze-file/route.ts"
    ];

    for (const route of forbiddenRoutes) {
      await expect(access(path.join(workspaceRoot, route))).rejects.toThrow();
    }
  });

  it("does not expose server routes for browser-only derived drafts", async () => {
    const forbiddenRoutes = [
      "apps/web/app/api/meetings/[meetingId]/audio/quality/route.ts",
      "apps/web/app/api/meetings/[meetingId]/audio/normalize/route.ts",
      "apps/web/app/api/meetings/[meetingId]/audio/vad/route.ts",
      "apps/web/app/api/meetings/[meetingId]/audio/overlap/route.ts",
      "apps/web/app/api/meetings/[meetingId]/audio/diarize/route.ts",
      "apps/web/app/api/meetings/[meetingId]/speakers/route.ts",
      "apps/web/app/api/meetings/[meetingId]/review-queue/route.ts",
      "apps/web/app/api/projects/[projectId]/dictionary/route.ts",
      "apps/web/app/api/transcript-segments/[segmentId]/reprocess/route.ts"
    ];
    for (const route of forbiddenRoutes) {
      await expect(access(path.join(workspaceRoot, route))).rejects.toThrow();
    }
  });

  it("does not include a production test reset route", async () => {
    await expect(access(path.join(workspaceRoot, "apps/web/app/api/test/reset/route.ts"))).rejects.toThrow();
  });

  it("keeps every non-health API behind DB-revalidated session authentication", async () => {
    const protectedRoutes = [
      "apps/web/app/api/ai/status/route.ts",
      "apps/web/app/api/meetings/[meetingId]/transcript/route.ts",
      "apps/web/app/api/meetings/[meetingId]/transcript.txt/route.ts",
      "apps/web/app/api/meetings/[meetingId]/transcript/revisions/route.ts",
      "apps/web/app/api/meetings/[meetingId]/minutes/route.ts",
      "apps/web/app/api/meetings/[meetingId]/minutes/generate/route.ts",
      "apps/web/app/api/meetings/[meetingId]/minutes/revisions/route.ts",
      "apps/web/app/api/meetings/[meetingId]/recording-consent/route.ts",
      "apps/web/app/api/meetings/[meetingId]/route.ts",
      "apps/web/app/api/minutes/finalize/route.ts",
      "apps/web/app/api/minutes/generate/route.ts"
    ];
    for (const route of protectedRoutes) {
      const source = await readFile(path.join(workspaceRoot, route), "utf8");
      expect(source, `${route} must revalidate the DB session`).toContain("getSessionPayload");
      expect(source, `${route} must reject missing sessions`).toContain("UNAUTHENTICATED");
    }
  });

  it("connects confirmed-content mutations to size and idempotency guards", async () => {
    for (const route of [
      "apps/web/app/api/meetings/[meetingId]/transcript/route.ts",
      "apps/web/app/api/meetings/[meetingId]/minutes/route.ts",
      "apps/web/app/api/minutes/finalize/route.ts"
    ]) {
      const source = await readFile(path.join(workspaceRoot, route), "utf8");
      expect(source).toContain("readLimitedJson");
      expect(source).toContain("readIdempotencyKey");
    }
  });

  it("guards privacy mutations and discloses external AI transmission before execution", async () => {
    for (const route of [
      "apps/web/app/api/meetings/[meetingId]/recording-consent/route.ts",
      "apps/web/app/api/meetings/[meetingId]/route.ts"
    ]) {
      const source = await readFile(path.join(workspaceRoot, route), "utf8");
      expect(source).toContain("readLimitedJson");
      expect(source).toContain("assertRequestScope");
    }
    const generation = await readFile(path.join(workspaceRoot, "apps/web/app/api/meetings/[meetingId]/minutes/generate/route.ts"), "utf8");
    const ui = await readFile(path.join(workspaceRoot, "apps/web/app/RecordingPanel.tsx"), "utf8");
    expect(generation).toContain("EXTERNAL_AI_CONSENT_REQUIRED");
    expect(generation).toContain("recordExternalAiConsent");
    expect(ui).toContain("Gemini 외부 전송 동의");
    expect(ui).toContain("원본 음성은 전송되지 않으며");
  });

  it("keeps database operations scripts credential-safe and production-restore guarded", async () => {
    const backup = await readFile(path.join(workspaceRoot, "scripts/db-backup.sh"), "utf8");
    const restore = await readFile(path.join(workspaceRoot, "scripts/db-restore-verify.sh"), "utf8");
    expect(backup).toContain("umask 077");
    expect(backup).toContain("sha256sum");
    expect(restore).toContain("RESTORE_DATABASE_URL must not be the production DATABASE_URL");
    expect(restore).toContain("0007_privacy_retention_operations.sql");
  });

  it("pins each production service to the correct Docker target and database major", async () => {
    const compose = await readFile(path.join(workspaceRoot, "compose.ec2.yml"), "utf8");
    const dockerfile = await readFile(path.join(workspaceRoot, "Dockerfile"), "utf8");
    expect(compose).toMatch(/web:\s+[\s\S]*?target: runner/);
    expect(compose).toMatch(/worker:\s+[\s\S]*?target: worker-runner/);
    expect(compose).toContain('POSTGRES_OPS_VERSION: ${POSTGRES_OPS_VERSION:-16}');
    expect(dockerfile).toContain("ARG POSTGRES_OPS_VERSION=16");
    expect(dockerfile).toContain("FROM postgres:${POSTGRES_OPS_VERSION}-alpine AS db-ops");
  });

  it("keeps browser recording code free of server audio requests", async () => {
    for (const file of [
      "apps/web/app/RecordingPanel.tsx",
      "apps/web/app/useBrowserRecording.ts",
      "apps/web/app/browser-recording.ts",
      "apps/web/app/AudioQualityPanel.tsx"
    ]) {
      const source = await readFile(path.join(workspaceRoot, file), "utf8");
      expect(source, file).not.toContain("/api/recordings");
      expect(source, file).not.toContain("/api/audio");
      expect(source, file).not.toContain("bodyBase64");
    }
    const qualitySource = await readFile(path.join(workspaceRoot, "apps/web/app/browser-recording.ts"), "utf8");
    expect(qualitySource).toContain('persistence: "BROWSER_ONLY"');
  });

  it("does not offer an environment switch that enables raw audio upload", async () => {
    const examples = await Promise.all([
      readFile(path.join(workspaceRoot, ".env.example"), "utf8"),
      readFile(path.join(workspaceRoot, ".env.docker.example"), "utf8")
    ]);
    expect(examples.join("\n")).not.toContain("ALLOW_RAW_AUDIO_SERVER_UPLOAD");
  });

  it("keeps the stage 6 worker limited to confirmed-text jobs", async () => {
    const source = await readFile(path.join(workspaceRoot, "apps/worker/src/index.ts"), "utf8");
    expect(source).toContain('"minutes.generate"');
    expect(source).toContain("UNSUPPORTED_BROWSER_ONLY_JOB");
    expect(source).not.toContain("audioBase64");
    expect(source).not.toContain("sourceStorageKey");
    expect(source).not.toContain("getDemo");
    expect(source).not.toContain("saveDemo");
  });
});
