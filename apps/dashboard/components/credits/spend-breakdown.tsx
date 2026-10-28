"use client";

import type { SpendShare } from "@thaipass/core/aipass/history";

import { formatCredits } from "@/lib/format";

export interface SpendBreakdownProps {
  readonly heading: string;
  readonly locale: string;
  readonly shares: readonly SpendShare[];
  /** Shown for the null key. */
  readonly unnamedLabel: string;
}

const FULL_PERCENT = 100;

/** A sorted bar list. `shares` comes from `spendOf`. */
export const SpendBreakdown = ({
  heading,
  locale,
  shares,
  unnamedLabel,
}: SpendBreakdownProps) => {
  const top = Math.max(...shares.map((share) => share.credits), 0);
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="text-muted-foreground bg-muted/40 border-b px-4 py-2 text-xs font-medium">
        {heading}
      </div>
      <ul className="divide-y">
        {shares.map((share) => (
          <li
            className="relative flex items-center justify-between gap-4 px-4 py-2 text-sm"
            key={share.key ?? "none"}
          >
            <span
              aria-hidden="true"
              className="bg-chart-1/10 absolute inset-y-0 left-0"
              style={{ width: `${(share.credits / top) * FULL_PERCENT}%` }}
            />
            <span className="relative min-w-0 truncate">
              {share.key ?? unnamedLabel}
            </span>
            <span className="relative shrink-0 tabular-nums">
              {formatCredits(share.credits, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
