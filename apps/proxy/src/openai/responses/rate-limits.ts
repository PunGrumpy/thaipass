import type { Credits } from "@thaipass/core/aipass/quotas";

const FULL_PERCENT = 100;
const MS_PER_SECOND = 1000;
/** Upstream sends when the period ends but not how long it is. */
const PERIOD_MINUTES = 1440;

/** Codex reads its limits from these headers, not from usage.credits (codex-rs/codex-api/src/rate_limits.rs). */
export const codexLimitHeaders = (credits: Credits) => {
  const { creditsAvailable, creditsLimit, creditsResetAt, creditsUsed } =
    credits;
  const resetAt = Date.parse(creditsResetAt);
  return {
    "x-codex-credits-balance": String(creditsAvailable),
    "x-codex-credits-has-credits": String(creditsAvailable > 0),
    "x-codex-credits-unlimited": "false",
    "x-codex-primary-window-minutes": String(PERIOD_MINUTES),
    ...(creditsLimit > 0 && {
      "x-codex-primary-used-percent": String(
        Math.min(FULL_PERCENT, (creditsUsed / creditsLimit) * FULL_PERCENT)
      ),
    }),
    ...(Number.isFinite(resetAt) && {
      "x-codex-primary-reset-at": String(Math.floor(resetAt / MS_PER_SECOND)),
    }),
  };
};
