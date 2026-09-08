import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: { tsconfig: "../../tsconfig.base.json" },
  entry: ["src/index.ts"],
  format: "esm",
  platform: "neutral",
});
