import { createEnv } from "@t3-oss/env-core";
import { log } from "evlog";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    const named = issues.map(
      (issue) => `${issue.path?.join(".") ?? "env"}: ${issue.message}`
    );
    for (const issue of issues) {
      log.error({
        msg: "invalid environment",
        reason: issue.message,
        variable: issue.path?.join(".") ?? "env",
      });
    }
    throw new Error(`invalid environment: ${named.join("; ")}`);
  },
  runtimeEnv: process.env,
  server: {
    AIPASS_COOKIE: z.string().optional(),
    AIPASS_HOST: z.string().default("127.0.0.1"),
    AIPASS_ORIGIN: z.url().default("https://de.aipass.net"),
    AIPASS_PORT: z.coerce.number().int().positive().default(3001),
    POSTHOG_API_KEY: z.string().startsWith("phc_").optional(),
    POSTHOG_HOST: z.url().optional().default("https://us.i.posthog.com"),
    VERCEL: z.string().optional(),
  },
});
