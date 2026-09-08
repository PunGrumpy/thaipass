import type { NextConfig } from "next";

import "@/env";

const nextConfig: NextConfig = {
  transpilePackages: ["@thaipass/core"],
};

export default nextConfig;
