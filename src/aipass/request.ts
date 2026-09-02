import type { z } from "zod";

import { config } from "../lib/config";

const browserHeaders = (cookie: string, referer: string) => ({
  accept: "*/*",
  "accept-language": "th-TH,th;q=0.9,en;q=0.8",
  cookie,
  origin: config.origin,
  referer,
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent": config.userAgent,
});

export const browserPostHeaders = (
  cookie: string,
  referer: string,
  contentType: string
) => ({
  ...browserHeaders(cookie, referer),
  "content-type": contentType,
});

export const loadJson = async <T>(
  path: string,
  schema: z.ZodType<T>,
  cookie: string,
  signal: AbortSignal | undefined
): Promise<T | null> => {
  let payload: unknown;
  try {
    const response = await fetch(`${config.origin}${path}`, {
      headers: browserHeaders(cookie, `${config.origin}/chat`),
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      return null;
    }
    payload = await response.json();
  } catch {
    return null;
  }
  const decoded = schema.safeParse(payload);
  return decoded.success ? decoded.data : null;
};
