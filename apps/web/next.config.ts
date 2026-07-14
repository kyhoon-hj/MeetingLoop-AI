import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@meetingloop/ai", "@meetingloop/db", "@meetingloop/domain", "@meetingloop/ui"]
};

export default nextConfig;
