import type { NextConfig } from "next";

import "@/env";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@thaipass/core"],
};

export default nextConfig;
