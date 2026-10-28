"use client";

import { useI18n } from "@thaipass/internationalization";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { ChartModel } from "@/lib/credit-chart";
import { fill, formatCredits, formatMoment } from "@/lib/format";

const TICK_COUNT = 6;

const MS_PER_HOUR = 3_600_000;
/** A chart with a minute of history would be a point; this much time is always on the axis. */
const MIN_VISIBLE_MS = 6 * MS_PER_HOUR;
/** Past this span a tick names a day, under it a tick names a time. */
const DAY_TICKS_FROM_MS = 48 * MS_PER_HOUR;

const tickLabel = (at: number, span: number, locale: string): string =>
  new Date(at).toLocaleString(
    locale,
    span > DAY_TICKS_FROM_MS
      ? { day: "numeric", month: "short" }
      : { hour: "2-digit", minute: "2-digit" }
  );

/** Evenly spaced, because recharts rounds a time axis to uneven "nice" ticks that crowd each other. */
const evenTicks = (first: number, last: number): number[] =>
  Array.from(
    { length: TICK_COUNT },
    (_, index) => first + ((last - first) * index) / (TICK_COUNT - 1)
  );
const FILL_OPACITY = 0.14;
const PROJECTION_DASH = "5 4";

/**
 * Remaining credits as a solid step area, the projection as a dashed line, a
 * "+refill" label at each reset, the now line and the empty-at dot. Both lines
 * come from one row array, so they meet at now.
 */
export const CreditChart = ({ model }: { readonly model: ChartModel }) => {
  const { locale, t } = useI18n();
  const { credits } = t;

  const config = {
    projected: { color: "var(--chart-1)", label: credits.projected },
    recorded: { color: "var(--chart-1)", label: credits.recorded },
  } satisfies ChartConfig;

  const first = model.rows[0]?.at ?? model.now;
  const last = model.rows.at(-1)?.at ?? model.now;
  const start = Math.min(first, last - MIN_VISIBLE_MS);

  return (
    <figure aria-label={credits.chartLabel}>
      <ChartContainer className="aspect-auto h-72 w-full" config={config}>
        <ComposedChart
          accessibilityLayer={false}
          data={[...model.rows]}
          margin={{ left: 4, right: 28, top: 20 }}
          role="presentation"
          tabIndex={-1}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="at"
            domain={[start, last]}
            scale="time"
            interval={0}
            ticks={evenTicks(start, last)}
            tickFormatter={(value: number) =>
              tickLabel(value, last - start, locale)
            }
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            domain={[0, model.ceiling]}
            tickFormatter={(value: number) => formatCredits(value, locale)}
            tickLine={false}
            width={48}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) =>
                  formatMoment(Number(payload[0]?.payload?.at), locale)
                }
              />
            }
          />
          <Area
            dataKey="recorded"
            dot={false}
            fill="var(--color-recorded)"
            fillOpacity={FILL_OPACITY}
            isAnimationActive={false}
            stroke="var(--color-recorded)"
            strokeWidth={2}
            type="stepAfter"
          />
          <Line
            dataKey="projected"
            dot={false}
            isAnimationActive={false}
            stroke="var(--color-projected)"
            strokeDasharray={PROJECTION_DASH}
            strokeWidth={2}
            type="linear"
          />
          {model.resets.map((reset) => (
            <ReferenceLine
              key={`${reset.at}-${reset.projected}`}
              label={{
                fill: "var(--muted-foreground)",
                fontSize: 11,
                position: "top",
                value: fill(
                  credits.refill,
                  formatCredits(reset.refill, locale)
                ),
              }}
              stroke="var(--border)"
              strokeDasharray={reset.projected ? PROJECTION_DASH : undefined}
              x={reset.at}
            />
          ))}
          <ReferenceLine
            label={{
              fill: "var(--foreground)",
              fontSize: 11,
              position: "insideTopRight",
              value: credits.now,
            }}
            stroke="var(--foreground)"
            strokeOpacity={0.5}
            x={model.now}
          />
          {model.emptyAt === null ? null : (
            <ReferenceDot
              fill="var(--destructive)"
              r={4}
              stroke="var(--background)"
              x={model.emptyAt}
              y={0}
            />
          )}
        </ComposedChart>
      </ChartContainer>
    </figure>
  );
};
