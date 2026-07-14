import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ["@meetingloop/ai", "@meetingloop/db", "@meetingloop/domain", "@meetingloop/ui"]
};

export default nextConfig;
