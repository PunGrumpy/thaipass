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
