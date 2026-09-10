import type { NextConfig } from "next";

import "@/env";

const nextConfig: NextConfig = {
  transpilePackages: ["@thaipass/core", "@thaipass/internationalization"],
};

export default nextConfig;
