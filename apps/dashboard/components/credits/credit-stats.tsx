"use client";

import { BURN_WINDOWS } from "@thaipass/core/aipass/history";
import type { BurnWindow, Forecast } from "@thaipass/core/aipass/history";
import { useI18n } from "@thaipass/internationalization";
import type { Dictionary } from "@thaipass/internationalization";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fill,
  formatCredits,
  formatDuration,
  formatMoment,
} from "@/lib/format";

export interface CreditStatsProps {
  readonly burnWindow: BurnWindow;
  readonly forecast: Forecast;
  readonly onBurnWindowChange: (window: BurnWindow) => void;
}

const FULL_PERCENT = 100;
const MS_PER_SECOND = 1000;

const isBurnWindow = (value: unknown): value is BurnWindow =>
  BURN_WINDOWS.some((window) => window === value);

interface StatProps {
  readonly children?: React.ReactNode;
  readonly label: string;
  readonly note?: string;
  readonly value: string;
}

const Stat = ({ children, label, note, value }: StatProps) => (
  <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
    <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium">
      <span>{label}</span>
      {children}
    </div>
    <span className="truncate text-lg font-medium tabular-nums">{value}</span>
    {note ? (
      <span className="text-muted-foreground truncate text-xs">{note}</span>
    ) : null}
  </div>
);

interface EmptyStat {
  readonly note?: string;
  readonly value: string;
}

const describeEmpty = (
  forecast: Forecast,
  credits: Dictionary["credits"],
  locale: string
): EmptyStat => {
  const { empty } = forecast;
  switch (empty.kind) {
    case "at": {
      const seconds = (empty.at - forecast.at) / MS_PER_SECOND;
      return {
        note: formatMoment(empty.at, locale),
        value: fill(credits.inDuration, formatDuration(seconds)),
      };
    }
    case "before-reset": {
      return {
        note: formatMoment(empty.resetsAt, locale),
        value: credits.notBeforeReset,
      };
    }
    case "idle": {
      return { value: credits.idle };
    }
    case "empty": {
      return { value: credits.empty };
    }
    default: {
      return { value: credits.unknown };
    }
  }
};

/**
 * Four figures: what is left, when it runs out, the next reset and the burn.
 * `forecast.empty.kind` decides the second, so the page never shows a time it
 * has no basis for.
 */
export const CreditStats = ({
  burnWindow,
  forecast,
  onBurnWindowChange,
}: CreditStatsProps) => {
  const { locale, t } = useI18n();
  const { credits } = t;
  const { limit, nextReset, remaining } = forecast;
  const percent =
    limit > 0 ? Math.round((remaining / limit) * FULL_PERCENT) : 0;

  const emptyStat = describeEmpty(forecast, credits, locale);

  return (
    <div className="grid divide-y overflow-hidden rounded-xl border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
      <Stat
        label={credits.remaining}
        note={`${percent}%`}
        value={fill(
          credits.remainingOf,
          formatCredits(remaining, locale),
          formatCredits(limit, locale)
        )}
      />
      <Stat
        label={credits.emptyAt}
        note={emptyStat.note}
        value={emptyStat.value}
      />
      <Stat
        label={credits.nextReset}
        note={formatMoment(nextReset.at, locale)}
        value={fill(credits.refill, formatCredits(nextReset.refill, locale))}
      />
      <Stat
        label={fill(credits.burn, burnWindow)}
        value={
          forecast.burnPerHour === null
            ? credits.unknown
            : fill(credits.perHour, formatCredits(forecast.burnPerHour, locale))
        }
      >
        <Tabs
          onValueChange={(next) => {
            if (isBurnWindow(next)) {
              onBurnWindowChange(next);
            }
          }}
          value={burnWindow}
        >
          <TabsList>
            {BURN_WINDOWS.map((window) => (
              <TabsTrigger key={window} value={window}>
                {window}h
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Stat>
    </div>
  );
};
