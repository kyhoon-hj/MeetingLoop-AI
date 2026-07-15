import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = process.cwd();

describe("data storage policy", () => {
  it("does not expose raw audio upload or playback API routes", async () => {
    const forbiddenRoutes = [
      "apps/web/app/api/recordings/chunks/route.ts",
      "apps/web/app/api/recordings/playback-url/route.ts"
    ];

    for (const route of forbiddenRoutes) {
      await expect(access(path.join(workspaceRoot, route))).rejects.toThrow();
    }
  });

  it("keeps browser recording code free of server audio requests", async () => {
    const recordingPanel = await readFile(
      path.join(workspaceRoot, "apps/web/app/RecordingPanel.tsx"),
      "utf8"
    );
    expect(recordingPanel).not.toContain("/api/recordings");
    expect(recordingPanel).not.toContain("bodyBase64");
  });

  it("does not offer an environment switch that enables raw audio upload", async () => {
    const examples = await Promise.all([
      readFile(path.join(workspaceRoot, ".env.example"), "utf8"),
      readFile(path.join(workspaceRoot, ".env.docker.example"), "utf8")
    ]);
    expect(examples.join("\n")).not.toContain("ALLOW_RAW_AUDIO_SERVER_UPLOAD");
  });
});
