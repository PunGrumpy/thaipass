import type { Credits } from "@thaipass/core/aipass/quotas";

const FULL_PERCENT = 100;
const MS_PER_SECOND = 1000;
/** Upstream sends when the period ends but not how long it is. */
export const PERIOD_MINUTES = 1440;

export interface CreditWindow {
  readonly resetAt?: number;
  readonly usedPercent?: number;
}

/** The balance as a Codex rate-limit window, with the reset in Unix seconds. */
export const creditWindow = (credits: Credits): CreditWindow => {
  const { creditsLimit, creditsResetAt, creditsUsed } = credits;
  const resetAt = Date.parse(creditsResetAt);
  return {
    ...(Number.isFinite(resetAt) && {
      resetAt: Math.floor(resetAt / MS_PER_SECOND),
    }),
    ...(creditsLimit > 0 && {
      usedPercent: Math.min(
        FULL_PERCENT,
        (creditsUsed / creditsLimit) * FULL_PERCENT
      ),
    }),
  };
};

/** Codex reads its limits from these headers, not from usage.credits (codex-rs/codex-api/src/rate_limits.rs). */
export const codexLimitHeaders = (credits: Credits) => {
  const { creditsAvailable } = credits;
  const { resetAt, usedPercent } = creditWindow(credits);
  return {
    "x-codex-credits-balance": String(creditsAvailable),
    "x-codex-credits-has-credits": String(creditsAvailable > 0),
    "x-codex-credits-unlimited": "false",
    "x-codex-primary-window-minutes": String(PERIOD_MINUTES),
    ...(usedPercent !== undefined && {
      "x-codex-primary-used-percent": String(usedPercent),
    }),
    ...(resetAt !== undefined && {
      "x-codex-primary-reset-at": String(resetAt),
    }),
  };
};
