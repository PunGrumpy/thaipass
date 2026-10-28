import { createEnv } from "@t3-oss/env-core";
import { keys as core } from "@thaipass/core/keys";
import { DEFAULT_PRICES_URL } from "@thaipass/core/lib/config";
import { log } from "evlog";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  extends: [core()],
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
    AIPASS_PRICES: z
      .union([z.url(), z.literal("off")])
      .default(DEFAULT_PRICES_URL),
    /** The deployer's own Upstash Redis, as the Vercel Marketplace integration names it. Unset means no credit history. */
    KV_REST_API_TOKEN: z.string().optional(),
    KV_REST_API_URL: z.url().optional(),
    POSTHOG_API_KEY: z.string().startsWith("phc_").optional(),
    POSTHOG_HOST: z.url().optional().default("https://us.i.posthog.com"),
    /** 32 bytes of base64. Without it the gateway issues no thaipass tokens. */
    THAIPASS_TOKEN_KEY: z.string().optional(),
    /** The same store under the names @upstash/redis and a hand-made database use. */
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    VERCEL: z.string().optional(),
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
