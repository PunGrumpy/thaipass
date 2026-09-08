import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/app.ts"],
  format: "esm",
  platform: "node",
});
