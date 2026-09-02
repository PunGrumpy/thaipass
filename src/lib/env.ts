import { createEnv } from "@t3-oss/env-core";
import { log } from "evlog";
import { z } from "zod";

const DEFAULT_PORT = 3789;

export const env = createEnv({
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    for (const issue of issues) {
      log.error({
        msg: "invalid environment",
        reason: issue.message,
        variable: issue.path?.join(".") ?? "env",
      });
    }
    process.exit(1);
  },
  runtimeEnv: process.env,
  server: {
    AIPASS_HOST: z.string().min(1).default("127.0.0.1"),
    AIPASS_ORIGIN: z.url().default("https://de.aipass.net"),
    AIPASS_PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  },
});
