import { defineConfig } from "tsdown";

// devDependencies (core) are inlined; dependencies stay imports for Vercel to trace.
export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/app.ts"],
  format: "esm",
  platform: "node",
});
