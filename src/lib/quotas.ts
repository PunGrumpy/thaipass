import { z } from "zod";

import { config } from "./config.ts";

const QUOTA_PATH = "/loaders/get-usage-quota";

const amountSchema = z.union([z.string(), z.number()]);

const quotaResponseSchema = z.object({
  creditStatus: z.object({
    credits: z.object({
      available: amountSchema,
      limit: amountSchema,
      used: amountSchema,
    }),
    creditsDecimals: z.number().int().min(0).max(18),
    periodEndsAt: z.string(),
  }),
});

export interface Credits {
  readonly creditsAvailable: number;
  readonly creditsLimit: number;
  readonly creditsUsed: number;
  readonly creditsResetAt: string;
}

export const fetchCredits = async (
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Credits | null> => {
  let payload: unknown;
  try {
    const response = await fetch(`${config.origin}${QUOTA_PATH}`, {
      headers: {
        accept: "*/*",
        cookie,
        referer: `${config.origin}/chat`,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": config.userAgent,
      },
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
  const decoded = quotaResponseSchema.safeParse(payload);
  if (!decoded.success) {
    return null;
  }
  const { credits, creditsDecimals, periodEndsAt } = decoded.data.creditStatus;
  const scale = 10 ** creditsDecimals;
  return {
    creditsAvailable: Number(credits.available) / scale,
    creditsLimit: Number(credits.limit) / scale,
    creditsResetAt: periodEndsAt,
    creditsUsed: Number(credits.used) / scale,
  };
};
