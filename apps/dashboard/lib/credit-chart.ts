import type { Forecast, Timeline } from "@thaipass/core/aipass/history";

/**
 * One row per x. recharts draws `recorded` solid and `projected` dashed from
 * two keys of one array, and a null breaks the line. The row at "now" carries
 * both so the two lines meet.
 */
export interface ChartRow {
  readonly at: number;
  readonly recorded: number | null;
  readonly projected: number | null;
}

export interface ChartReset {
  readonly at: number;
  readonly refill: number;
  readonly projected: boolean;
}

export interface ChartModel {
  readonly rows: readonly ChartRow[];
  readonly now: number;
  /** y axis top: the largest limit seen. */
  readonly ceiling: number;
  /** Reset instants, for the "+refill" labels. */
  readonly resets: readonly ChartReset[];
  readonly emptyAt: number | null;
}

const remainingOf = (limit: number, used: number): number =>
  Math.max(0, limit - used);

/**
 * Pure. Recorded rows are the remaining balance as a step line, because spend
 * lands at the sample that saw it. A period opened by a reset starts with a
 * limit-high row at the reset instant, so the step up is vertical there.
 * Projected rows are `forecast.projection` verbatim.
 */
export const toChartModel = (
  timeline: Timeline,
  forecast: Forecast
): ChartModel => {
  const rows: ChartRow[] = [];
  const resets: ChartReset[] = [];
  let before = 0;
  for (const period of timeline) {
    if (period.startedAt !== null) {
      rows.push({
        at: period.startedAt,
        projected: null,
        recorded: period.limit,
      });
      resets.push({
        at: period.startedAt,
        projected: false,
        refill: period.limit - before,
      });
    }
    for (const point of period.points) {
      before = remainingOf(period.limit, point.used);
      rows.push({ at: point.at, projected: null, recorded: before });
    }
  }

  const [meeting, ...ahead] = forecast.projection;
  const last = rows.at(-1);
  if (last && meeting) {
    rows[rows.length - 1] = { ...last, projected: meeting.remaining };
  }
  let previous = meeting;
  for (const point of ahead) {
    rows.push({ at: point.at, projected: point.remaining, recorded: null });
    if (previous?.at === point.at && point.remaining > previous.remaining) {
      resets.push({
        at: point.at,
        projected: true,
        refill: point.remaining - previous.remaining,
      });
    }
    previous = point;
  }

  return {
    ceiling: Math.max(...timeline.map((period) => period.limit)),
    emptyAt: forecast.empty.kind === "at" ? forecast.empty.at : null,
    now: forecast.at,
    resets,
    rows,
  };
};
