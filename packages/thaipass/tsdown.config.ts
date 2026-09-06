import { defineConfig } from "tsdown";

// The root tsconfig lets tsgo emit core's declarations next to the provider's.
export default defineConfig({
  clean: true,
  dts: { tsconfig: "../../tsconfig.thaipass.json" },
  entry: ["src/index.ts"],
  format: "esm",
  platform: "neutral",
});
