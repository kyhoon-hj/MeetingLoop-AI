import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const standaloneOutput = process.platform === "win32" ? {} : { output: "standalone" as const };

const nextConfig: NextConfig = {
  ...standaloneOutput,
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ["@meetingloop/ai", "@meetingloop/db", "@meetingloop/domain", "@meetingloop/queue", "@meetingloop/ui"]
};

export default nextConfig;
