import { defineConfig } from "tsdown";

/**
 * Vercel's entry. tsdown bundles devDependencies, so @thaipass/core is
 * inlined, and leaves dependencies as imports for Vercel to trace into
 * the function's node_modules.
 */
export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/app.ts"],
  format: "esm",
  platform: "node",
});
