import { createEnv } from "@t3-oss/env-nextjs";
import { keys as core } from "@thaipass/core/env/keys";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: {
    NEXT_PUBLIC_PROXY_URL: process.env.NEXT_PUBLIC_PROXY_URL,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
  },
  extends: [core()],
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
});
