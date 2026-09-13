import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    client: {
      /**
       * Whether the dashboard pins its gateway. A deployment usually should:
       * a reader who points it at another gateway takes their traffic, and the
       * logs and metrics with it. Unset means pinned wherever the gateway is
       * not on loopback, which is the shape a deployment has.
       */
      NEXT_PUBLIC_PROXY_LOCKED: z.enum(["0", "1"]).optional(),
      NEXT_PUBLIC_PROXY_URL: z.url().default("http://localhost:3001"),
      NEXT_PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),
    },
    emptyStringAsUndefined: true,
    runtimeEnv: {
      AIPASS_CORS_ORIGIN: process.env.AIPASS_CORS_ORIGIN,
      NEXT_PUBLIC_PROXY_LOCKED: process.env.NEXT_PUBLIC_PROXY_LOCKED,
      NEXT_PUBLIC_PROXY_URL: process.env.NEXT_PUBLIC_PROXY_URL,
      NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    },
    server: {
      AIPASS_CORS_ORIGIN: z.string().optional(),
    },
    skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  });
