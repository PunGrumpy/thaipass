import { z } from "zod";

import { loadJson } from "./request";

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
  const quota = await loadJson(QUOTA_PATH, quotaResponseSchema, cookie, signal);
  if (!quota) {
    return null;
  }
  const { credits, creditsDecimals, periodEndsAt } = quota.creditStatus;
  const scale = 10 ** creditsDecimals;
  return {
    creditsAvailable: Number(credits.available) / scale,
    creditsLimit: Number(credits.limit) / scale,
    creditsResetAt: periodEndsAt,
    creditsUsed: Number(credits.used) / scale,
  };
};
