export const formatPercent = (used: number, limit: number): number =>
  limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

/** Absolute time is what a quota reset actually means; relative is the nicety. */
export const formatResetAt = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "End of period";
  }
  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
};

export const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "Something went wrong";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** Lesson length and watched time, as the LMS player shows them: m:ss. */
export const formatClock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  return `${minutes}:${String(whole % SECONDS_PER_MINUTE).padStart(2, "0")}`;
};

export const formatPlural = (count: number, noun: string): string =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Course length, where m:ss stops reading as a duration: a 90 minute course is
 * "1h 30m", not "90:00".
 */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

const TOKENS_PER_MILLION = 1_000_000;

/** Formats an estimated turn cost in USD: $0.00, <$0.0001, $0.0014, or $1.25. */
export const formatUsd = (amount: number): string => {
  if (amount === 0) {
    return "$0.00";
  }
  if (amount < 0.0001) {
    return "<$0.0001";
  }
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(2)}`;
};

/** Formats a per-token dollar rate into a price per 1M tokens: $0.15, $3.00, etc. */
export const formatRatePerMillion = (perTokenRate: number): string => {
  const perMillion = perTokenRate * TOKENS_PER_MILLION;
  if (perMillion === 0) {
    return "$0.00";
  }
  if (perMillion < 0.01) {
    return `$${perMillion.toFixed(4)}`;
  }
  return `$${perMillion.toFixed(2)}`;
};
