import { defineConfig } from "tsdown";

/**
 * One ESM entry with @thaipass/core folded in; zod and the AI SDK stay
 * external. Declarations come from the repo-root tsconfig.thaipass.json,
 * because tsgo emits them relative to that file's directory and the
 * bundle needs core's alongside the provider's own.
 */
export default defineConfig({
  clean: true,
  dts: { tsconfig: "../../tsconfig.thaipass.json" },
  entry: ["src/index.ts"],
  format: "esm",
  platform: "neutral",
});
