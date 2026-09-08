import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * `next dev` owns `.next/dev`, but `next build` writes its tree into the
   * same `.next` root, so building while the dev server runs pulls the ground
   * out from under it and in-flight RSC requests fail. Setting NEXT_DIST_DIR
   * gives a verification build its own directory to clobber.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@thaipass/core"],
};

export default nextConfig;
