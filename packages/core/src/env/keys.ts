import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const keys = () =>
  createEnv({
    client: {
      NEXT_PUBLIC_PROXY_URL: z.url().default("http://127.0.0.1:3001"),
      NEXT_PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),
    },
    clientPrefix: "NEXT_PUBLIC_",
    emptyStringAsUndefined: true,
    runtimeEnv: {
      AIPASS_CORS_ORIGIN: process.env.AIPASS_CORS_ORIGIN,
      NEXT_PUBLIC_PROXY_URL:
        process.env.NEXT_PUBLIC_PROXY_URL ??
        process.env.PROXY_URL ??
        "http://127.0.0.1:3001",
      NEXT_PUBLIC_WEB_URL:
        process.env.NEXT_PUBLIC_WEB_URL ??
        process.env.WEB_URL ??
        "http://localhost:3000",
      PROXY_URL:
        process.env.PROXY_URL ??
        process.env.NEXT_PUBLIC_PROXY_URL ??
        "http://127.0.0.1:3001",
      WEB_URL:
        process.env.WEB_URL ??
        process.env.NEXT_PUBLIC_WEB_URL ??
        "http://localhost:3000",
    },
    server: {
      AIPASS_CORS_ORIGIN: z.string().optional(),
      PROXY_URL: z.url().default("http://127.0.0.1:3001"),
      WEB_URL: z.url().default("http://localhost:3000"),
    },
  });
