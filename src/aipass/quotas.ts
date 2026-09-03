import { z } from "zod";

import { loadJson } from "./request";

const QUOTA_PATH = "/loaders/get-usage-quota";
const SETTLE_TIMEOUT_MS = 5000;

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

/** The balance as a reply reports it: AI Pass meters credits, not tokens. */
export const creditBalanceSchema = z.object({
  available: z.number(),
  limit: z.number(),
  reset_at: z.string(),
  used: z.number(),
});

export const creditUsageSchema = creditBalanceSchema.extend({
  spent: z.number().optional(),
});

export type CreditBalance = z.infer<typeof creditBalanceSchema>;
export type CreditUsage = z.infer<typeof creditUsageSchema>;

export const toCreditBalance = (credits: Credits): CreditBalance => ({
  available: credits.creditsAvailable,
  limit: credits.creditsLimit,
  reset_at: credits.creditsResetAt,
  used: credits.creditsUsed,
});

const toCreditUsage = (
  before: Credits | null,
  after: Credits | null
): CreditUsage | undefined => {
  const latest = after ?? before;
  if (!latest) {
    return undefined;
  }
  const balance = toCreditBalance(latest);
  if (!(before && after)) {
    return balance;
  }
  // A period rollover between the two reads shows as a negative difference.
  return {
    ...balance,
    spent: Math.max(0, after.creditsUsed - before.creditsUsed),
  };
};

export interface Settlement {
  readonly after: Credits | null;
  readonly usage: CreditUsage | undefined;
}

/**
 * Reads the balance again once the reply is in; the difference is what the
 * turn spent. The read has its own timeout because the request signal may
 * already be aborted by now.
 */
export const settleCredits = async (
  cookie: string,
  before: Promise<Credits | null>
): Promise<Settlement> => {
  const [start, after] = await Promise.all([
    before,
    fetchCredits(cookie, AbortSignal.timeout(SETTLE_TIMEOUT_MS)),
  ]);
  return { after, usage: toCreditUsage(start, after) };
};
