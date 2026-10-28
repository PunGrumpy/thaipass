/**
 * Credit history: the one module that knows what a balance series means.
 *
 * Everything here is pure and shared. The proxy writes and thins samples, the
 * dashboard decodes, forecasts and breaks down spend. No I/O and no clock
 * reads: `now` is always an argument or the timeline's last sample.
 *
 * Organizing structure: a `Timeline` is a list of `Period`s, one per reset
 * window. A reset is the boundary between two periods, so a burn rate, a
 * projection or a spend sum is computed inside one period and cannot span a
 * reset. Only `buildTimeline` mints a `Timeline`, so every consumer may trust
 * its invariants: ascending points, `used` never decreasing inside a period.
 */
import { z } from "zod";

import type { Credits } from "./quotas";

/** Milliseconds since the epoch. */
export type EpochMs = number;

type NonEmpty<T> = readonly [T, ...T[]];

const lastOf = <T>(list: NonEmpty<T>): T => list.at(-1) ?? list[0];

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MIN_BURN_SPAN_MS = 5 * MS_PER_MINUTE;
/** A `resetsAt` that moves by less than this is upstream jitter, not a new window. */
const RESET_JITTER_MS = MS_PER_MINUTE;
/**
 * A drop in `used` smaller than this share of the limit is a stale read, not a
 * reset. Two settles racing each other differ by about one turn's spend.
 */
const DROP_TOLERANCE = 0.02;
/** Samples younger than this keep full resolution, so every burn window sees them all. */
export const FULL_RESOLUTION_MS = 6 * MS_PER_HOUR;
export const THIN_BUCKET_MS = 15 * MS_PER_MINUTE;
const DEFAULT_HORIZON_PERIODS = 1;

/**
 * AI Pass gives `periodEndsAt` but never the length. The proxy's
 * `rate-limits.ts` derives its `PERIOD_MINUTES` from this constant, so there
 * is one assumption and one place to fix it.
 */
export const DEFAULT_PERIOD_MS = MS_PER_DAY;

/** The burn windows the page offers. The toggle and the type both come from this list. */
export const BURN_WINDOWS = [1, 3, 6] as const;
export type BurnWindow = (typeof BURN_WINDOWS)[number];

/** What one completion reported spending, by its own before and after reads. */
export interface SpendTag {
  readonly model: string;
  /** The caller's `x-thaipass-app`, when it sent one. */
  readonly app: string | null;
  readonly credits: number;
}

/** One observed balance. This is what the store holds and the proxy writes. */
export interface Sample {
  readonly at: EpochMs;
  readonly used: number;
  readonly limit: number;
  readonly resetsAt: EpochMs;
  /** Set only on a sample taken after a completion. Never a credential. */
  readonly spend: SpendTag | null;
}

/** A sample as it sits inside a period: ascending `at`, `used` never decreasing. */
export interface Point {
  readonly at: EpochMs;
  readonly used: number;
  readonly spend: SpendTag | null;
}

export interface Period {
  /** The reset that opened it, or null when recording began mid-period. */
  readonly startedAt: EpochMs | null;
  readonly resetsAt: EpochMs;
  readonly limit: number;
  readonly points: NonEmpty<Point>;
}

declare const normalized: unique symbol;

/** Ascending, non-empty periods. Mint it with `buildTimeline` only. */
export type Timeline = NonEmpty<Period> & {
  readonly [normalized]: true;
};

/** Why the balance will, or will not, reach zero. */
export type EmptyAt =
  | { readonly kind: "at"; readonly at: EpochMs }
  | { readonly kind: "before-reset"; readonly resetsAt: EpochMs }
  | { readonly kind: "idle" }
  | { readonly kind: "unknown" }
  | { readonly kind: "empty" };

export interface ProjectionPoint {
  readonly at: EpochMs;
  readonly remaining: number;
}

export interface Forecast {
  readonly at: EpochMs;
  readonly remaining: number;
  readonly limit: number;
  /** Credits per hour over the chosen window, or null when the window holds too little to say. */
  readonly burnPerHour: number | null;
  readonly empty: EmptyAt;
  /** `refill` is what the reset adds back: the limit minus what is left when it lands. */
  readonly nextReset: { readonly at: EpochMs; readonly refill: number };
  /**
   * Polyline from now to the horizon, empty when the burn is unknown. A reset
   * is two vertices at one `at`, so the chart draws a step without knowing
   * what a reset is.
   */
  readonly projection: readonly ProjectionPoint[];
}

export interface SpendShare {
  /** Null is spend nobody named: an app that sent no `x-thaipass-app`. */
  readonly key: string | null;
  readonly credits: number;
}

export interface Spend {
  /** What the periods' own `used` counters rose by: exact. */
  readonly total: number;
  readonly byModel: readonly SpendShare[];
  readonly byApp: readonly SpendShare[];
  /** Spend no completion through this proxy accounts for: web UI, media, another gateway. */
  readonly outside: number;
}

/** Whether the proxy has somewhere to keep history, and whether it answered. */
export type StoreStatus = "ready" | "off" | "down";

export interface CreditHistory {
  readonly store: StoreStatus;
  /** Stored samples plus the live balance the response was built around. */
  readonly timeline: Timeline;
}

/**
 * The tuple is the store member and the wire row, so there is one codec.
 * `[at, used, limit, resetsAt, model, app, credits]`
 */
const sampleTuple = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.string().nullable(),
  z.string().nullable(),
  z.number().nullable(),
]);
export type SampleTuple = z.infer<typeof sampleTuple>;
export const sampleTupleSchema = sampleTuple;

export const storeStatusSchema = z.enum(["ready", "off", "down"]);

export const historyResponseSchema = z.object({
  live: sampleTuple,
  samples: z.array(sampleTuple),
  store: storeStatusSchema,
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export const toTuple = (sample: Sample): SampleTuple => {
  const { at, limit, resetsAt, spend, used } = sample;
  return [
    at,
    used,
    limit,
    resetsAt,
    spend?.model ?? null,
    spend?.app ?? null,
    spend?.credits ?? null,
  ];
};

export const fromTuple = (tuple: SampleTuple): Sample => {
  const [at, used, limit, resetsAt, model, app, credits] = tuple;
  return {
    at,
    limit,
    resetsAt,
    spend: model !== null && credits !== null ? { app, credits, model } : null,
    used,
  };
};

/** Null when `creditsResetAt` does not parse: a sample without a reset cannot be placed. */
export const sampleFromCredits = (
  credits: Credits,
  at: EpochMs,
  spend: SpendTag | null = null
): Sample | null => {
  const resetsAt = Date.parse(credits.creditsResetAt);
  if (!Number.isFinite(resetsAt)) {
    return null;
  }
  return {
    at,
    limit: credits.creditsLimit,
    resetsAt,
    spend,
    used: credits.creditsUsed,
  };
};

const sameSpend = (a: SpendTag | null, b: SpendTag | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.model === b.model &&
    a.app === b.app &&
    a.credits === b.credits);

const sameSample = (a: Sample, b: Sample): boolean =>
  a.at === b.at &&
  a.used === b.used &&
  a.limit === b.limit &&
  a.resetsAt === b.resetsAt &&
  sameSpend(a.spend, b.spend);

const byTime = (a: Sample, b: Sample): number => a.at - b.at || a.used - b.used;

/** Sorted by time, exact repeats dropped. The store may hand back either. */
const normalize = (samples: readonly Sample[]): Sample[] => {
  const sorted = samples.toSorted(byTime);
  return sorted.filter((sample, index) => {
    const previous = sorted[index - 1];
    return previous === undefined || !sameSample(sample, previous);
  });
};

/** One reset window's samples, before points are repaired. */
interface Group {
  startedAt: EpochMs | null;
  resetsAt: EpochMs;
  limit: number;
  /** Highest `used` seen so far: the level a stale read must not drag down. */
  peak: number;
  readonly samples: [Sample, ...Sample[]];
}

const openGroup = (first: Sample, startedAt: EpochMs | null): Group => ({
  limit: first.limit,
  peak: first.used,
  resetsAt: first.resetsAt,
  samples: [first],
  startedAt,
});

/**
 * A sample that opens a new period, with the instant the period began, or
 * null when it belongs to the current one.
 *
 * - The old reset instant passed and upstream now names a later one: the
 *   period opened at the old `resetsAt`, a time known without a sample there.
 *   If upstream still names the old instant, its clock disagrees with ours and
 *   the sample stays put.
 * - `used` fell by more than the stale-read tolerance: an early reset or a
 *   refund, opened at the sample itself.
 * - `resetsAt` that moves while time has not passed and `used` held is a
 *   rolling window, so it stays one period.
 */
const opensPeriod = (group: Group, next: Sample): EpochMs | null => {
  const rolled =
    next.at >= group.resetsAt &&
    next.resetsAt > group.resetsAt + RESET_JITTER_MS;
  if (rolled) {
    return group.resetsAt;
  }
  const dropped = next.used < group.peak - next.limit * DROP_TOLERANCE;
  return dropped ? next.at : null;
};

/** A read of the period before the last reset that landed late. */
const isStale = (group: Group, next: Sample): boolean =>
  next.resetsAt < group.resetsAt - RESET_JITTER_MS;

const groupByPeriod = (samples: readonly Sample[]): Group[] => {
  const groups: Group[] = [];
  for (const sample of samples) {
    const current = groups.at(-1);
    if (!current) {
      groups.push(openGroup(sample, null));
      continue;
    }
    if (isStale(current, sample)) {
      continue;
    }
    const startedAt = opensPeriod(current, sample);
    if (startedAt === null) {
      current.samples.push(sample);
      current.limit = sample.limit;
      current.peak = Math.max(current.peak, sample.used);
      current.resetsAt = Math.max(current.resetsAt, sample.resetsAt);
    } else {
      groups.push(openGroup(sample, startedAt));
    }
  }
  return groups;
};

const isFlat = (point: Point, used: number): boolean =>
  point.spend === null && point.used === used;

const pointOf = (sample: Sample, used: number): Point => ({
  at: sample.at,
  spend: sample.spend,
  used,
});

/** Running max inside the period, with flat untagged runs reduced to their two ends. */
const toPoints = (group: Group): [Point, ...Point[]] => {
  const [first, ...rest] = group.samples;
  const points: [Point, ...Point[]] = [pointOf(first, first.used)];
  for (const sample of rest) {
    const last = lastOf(points);
    const used = Math.max(last.used, sample.used);
    const point = pointOf(sample, used);
    const before = points.at(-2);
    const extendsFlatRun =
      sample.spend === null &&
      before !== undefined &&
      isFlat(last, used) &&
      isFlat(before, used);
    if (extendsFlatRun) {
      points[points.length - 1] = point;
    } else {
      points.push(point);
    }
  }
  return points;
};

const toPeriod = (group: Group): Period => ({
  limit: group.limit,
  points: toPoints(group),
  resetsAt: group.resetsAt,
  startedAt: group.startedAt,
});

/**
 * Samples in any order, duplicates and stale reads allowed -> a Timeline.
 * Null for no samples.
 *
 * A late read racing a newer one is absorbed by the running max, so the line
 * never dips. A read that still names the period before the last reset, and
 * arrives after it, is dropped.
 */
export const buildTimeline = (samples: readonly Sample[]): Timeline | null => {
  const [first, ...rest] = groupByPeriod(normalize(samples)).map(toPeriod);
  if (!first) {
    return null;
  }
  const periods: NonEmpty<Period> = [first, ...rest];
  // SAFETY: the periods are ascending, non-empty and monotone by construction above, which is all the brand says.
  return periods as Timeline;
};

const remainingOf = (used: number, limit: number): number =>
  Math.max(0, limit - used);

/** The last point at or before `at`: spend lands at the sample that saw it. */
const usedAt = (points: NonEmpty<Point>, at: EpochMs): number => {
  const [first] = points;
  let { used } = first;
  for (const point of points) {
    if (point.at > at) {
      break;
    }
    ({ used } = point);
  }
  return used;
};

/**
 * Credits per hour over the last `hours` of the current period. Where the
 * window starts before the period's first sample, that sample is the start.
 * Null when the span is too short to say, which is not the same as 0.
 */
const burnOver = (period: Period, hours: BurnWindow): number | null => {
  const { points } = period;
  const now = lastOf(points);
  const start = Math.max(now.at - hours * MS_PER_HOUR, points[0].at);
  const span = now.at - start;
  if (span < MIN_BURN_SPAN_MS) {
    return null;
  }
  return (now.used - usedAt(points, start)) / (span / MS_PER_HOUR);
};

/** The observed gap between the last two resets, else the assumed day. */
const periodLength = (timeline: Timeline): number => {
  const last = lastOf(timeline);
  const before = timeline.at(-2);
  const gap = before ? last.resetsAt - before.resetsAt : 0;
  return gap > 0 ? gap : DEFAULT_PERIOD_MS;
};

/** The first reset after `after`, stepping by `length` when upstream's own is stale. */
const nextResetAfter = (
  resetsAt: EpochMs,
  after: EpochMs,
  length: number
): EpochMs =>
  resetsAt > after
    ? resetsAt
    : resetsAt + (Math.floor((after - resetsAt) / length) + 1) * length;

const emptyAt = (
  remaining: number,
  burn: number | null,
  now: EpochMs,
  reset: EpochMs
): EmptyAt => {
  if (remaining <= 0) {
    return { kind: "empty" };
  }
  if (burn === null) {
    return { kind: "unknown" };
  }
  if (burn <= 0) {
    return { kind: "idle" };
  }
  const at = now + (remaining / burn) * MS_PER_HOUR;
  return at < reset
    ? { at, kind: "at" }
    : { kind: "before-reset", resetsAt: reset };
};

interface ProjectionInput {
  readonly now: EpochMs;
  readonly remaining: number;
  readonly limit: number;
  readonly perHour: number;
  readonly firstReset: EpochMs;
  readonly length: number;
  readonly horizonPeriods: number;
}

/**
 * Remaining falls at the burn rate, clamped at 0. At each reset it is two
 * vertices at one instant, before and after. The line ends a whole
 * `horizonPeriods` of periods past the next reset.
 */
const project = (input: ProjectionInput): ProjectionPoint[] => {
  const { firstReset, horizonPeriods, length, limit, now, perHour } = input;
  const perMs = perHour / MS_PER_HOUR;
  const end = firstReset + horizonPeriods * length;
  const path: ProjectionPoint[] = [{ at: now, remaining: input.remaining }];
  let from = now;
  let level = input.remaining;
  let reset = firstReset;
  for (;;) {
    const until = Math.min(reset, end);
    const emptyTime =
      perMs > 0 ? from + level / perMs : Number.POSITIVE_INFINITY;
    if (emptyTime < until) {
      path.push({ at: emptyTime, remaining: 0 });
      level = 0;
    } else {
      level = Math.max(0, level - perMs * (until - from));
    }
    path.push({ at: until, remaining: level });
    if (reset >= end) {
      return path;
    }
    path.push({ at: reset, remaining: limit });
    from = reset;
    level = limit;
    reset += length;
  }
};

export interface ForecastOptions {
  readonly burnWindow: BurnWindow;
  /** Whole periods the projection runs past the next reset. */
  readonly horizonPeriods?: number;
}

/**
 * `now` is the timeline's last sample. The caller appends the live balance
 * before building, so a stale store never shows a stale "now".
 *
 * Burn rate is read from the `used` series inside the current period, never
 * from the sum of per-turn spend, which double-counts turns that overlap.
 */
export const forecast = (
  timeline: Timeline,
  options: ForecastOptions
): Forecast => {
  const period = lastOf(timeline);
  const now = lastOf(period.points);
  const remaining = remainingOf(now.used, period.limit);
  const burnPerHour = burnOver(period, options.burnWindow);
  const length = periodLength(timeline);
  const firstReset = nextResetAfter(period.resetsAt, now.at, length);
  const perHour = burnPerHour ?? 0;
  const remainingAtReset = Math.max(
    0,
    remaining - (perHour * (firstReset - now.at)) / MS_PER_HOUR
  );
  return {
    at: now.at,
    burnPerHour,
    empty: emptyAt(remaining, burnPerHour, now.at, firstReset),
    limit: period.limit,
    nextReset: { at: firstReset, refill: period.limit - remainingAtReset },
    projection:
      burnPerHour === null
        ? []
        : project({
            firstReset,
            horizonPeriods: options.horizonPeriods ?? DEFAULT_HORIZON_PERIODS,
            length,
            limit: period.limit,
            now: now.at,
            perHour: burnPerHour,
            remaining,
          }),
    remaining,
  };
};

const sharesOf = (totals: Map<string | null, number>): SpendShare[] => {
  const shares = [...totals]
    .map(([key, credits]) => ({ credits, key }))
    .filter((share) => share.credits > 0);
  const named = shares
    .filter((share) => share.key !== null)
    .toSorted((a, b) => b.credits - a.credits);
  return [...named, ...shares.filter((share) => share.key === null)];
};

const add = (
  totals: Map<string | null, number>,
  key: string | null,
  credits: number
): void => {
  totals.set(key, (totals.get(key) ?? 0) + credits);
};

/** What the period's own counter rose by while we watched it. */
const observedRise = (period: Period): number => {
  const [first] = period.points;
  const last = lastOf(period.points);
  const base =
    period.startedAt === null
      ? Math.max(0, first.used - (first.spend?.credits ?? 0))
      : 0;
  return Math.max(0, last.used - base);
};

/**
 * Spend by model and by app across the timeline. A period's own `used`
 * counter is the exact total. Each completion's own before/after spend is the
 * share it claims, and when overlapping completions claim more than the
 * counter rose by they are scaled down to it, which undoes the double count.
 * What no completion claims is `outside`. The split is approximate; the total
 * is not.
 */
export const spendOf = (timeline: Timeline): Spend => {
  const byModel = new Map<string | null, number>();
  const byApp = new Map<string | null, number>();
  let total = 0;
  let outside = 0;
  for (const period of timeline) {
    const rise = observedRise(period);
    const claims = period.points.filter((point) => point.spend !== null);
    const claimed = claims.reduce(
      (sum, point) => sum + (point.spend?.credits ?? 0),
      0
    );
    const scale = claimed > rise && claimed > 0 ? rise / claimed : 1;
    for (const point of claims) {
      const { spend } = point;
      if (spend) {
        add(byModel, spend.model, spend.credits * scale);
        add(byApp, spend.app, spend.credits * scale);
      }
    }
    total += rise;
    outside += Math.max(0, rise - claimed * scale);
  }
  return {
    byApp: sharesOf(byApp),
    byModel: sharesOf(byModel),
    outside,
    total,
  };
};

const spendKey = (spend: SpendTag): string =>
  JSON.stringify([spend.model, spend.app]);

/** One sample per tag, carrying the credits of every sample of that tag it replaces. */
const mergeBucket = (bucket: readonly Sample[]): Sample[] => {
  const tagged = new Map<string, Sample>();
  for (const sample of bucket) {
    if (sample.spend) {
      const key = spendKey(sample.spend);
      const earlier = tagged.get(key)?.spend?.credits ?? 0;
      tagged.set(key, {
        ...sample,
        spend: { ...sample.spend, credits: sample.spend.credits + earlier },
      });
    }
  }
  const kept = [...tagged.values()];
  const last = bucket.at(-1);
  if (last && !last.spend) {
    kept.push(last);
  }
  return kept;
};

/**
 * Fewer samples for the wire, with nothing the page needs lost. Samples
 * younger than `FULL_RESOLUTION_MS` are all kept, so every burn window sees
 * full resolution. Older ones fall to one level per `THIN_BUCKET_MS`, plus one
 * sample per model and app in the bucket that carries the credits of those it
 * replaces, so spend totals survive. The first and last sample of every period
 * always stay, so a reset and the step it draws never move.
 */
export const thin = (samples: readonly Sample[], now: EpochMs): Sample[] => {
  const cutoff = now - FULL_RESOLUTION_MS;
  const kept: Sample[] = [];
  for (const group of groupByPeriod(normalize(samples))) {
    const ends = new Set([group.samples[0], group.samples.at(-1)]);
    const buckets = new Map<number, Sample[]>();
    for (const sample of group.samples) {
      if (sample.at >= cutoff || ends.has(sample)) {
        kept.push(sample);
        continue;
      }
      const bucket = Math.floor(sample.at / THIN_BUCKET_MS);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), sample]);
    }
    for (const bucket of buckets.values()) {
      kept.push(...mergeBucket(bucket));
    }
  }
  return kept.toSorted(byTime);
};

/** Wire -> domain. The live sample is appended, so `timeline` always ends at now. */
export const decodeHistory = (wire: HistoryResponse): CreditHistory => {
  const timeline = buildTimeline(
    [...wire.samples, wire.live].map((tuple) => fromTuple(tuple))
  );
  if (!timeline) {
    throw new Error("a history response always carries its live sample");
  }
  return { store: wire.store, timeline };
};
