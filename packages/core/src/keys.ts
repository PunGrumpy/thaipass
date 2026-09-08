import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    client: {
      NEXT_PUBLIC_PROXY_URL: z.url().default("http://localhost:3001"),
      NEXT_PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),
    },
    emptyStringAsUndefined: true,
    runtimeEnv: {
      AIPASS_CORS_ORIGIN: process.env.AIPASS_CORS_ORIGIN,
      NEXT_PUBLIC_PROXY_URL: process.env.NEXT_PUBLIC_PROXY_URL,
      NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
      PROXY_URL: process.env.PROXY_URL,
      WEB_URL: process.env.WEB_URL,
    },
    server: {
      AIPASS_CORS_ORIGIN: z.string().optional(),
      PROXY_URL: z.url().default("http://localhost:3001"),
      WEB_URL: z.url().default("http://localhost:3000"),
    },
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  });
