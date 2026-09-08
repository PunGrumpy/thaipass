import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next, antiSlop],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "apps/dashboard/src/components/ui/**",
  ],
});
