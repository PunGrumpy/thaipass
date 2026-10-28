import { expect, test } from "bun:test";

import {
  buildTimeline,
  decodeHistory,
  forecast,
  fromTuple,
  historyResponseSchema,
  sampleFromCredits,
  spendOf,
  thin,
  toTuple,
} from "./history";
import type { Sample, SpendTag, Timeline } from "./history";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RESET = Date.parse("2026-09-04T00:00:00.000Z");
const LIMIT = 100;

const sample = (
  at: number,
  used: number,
  extra: Partial<Sample> = {}
): Sample => ({
  at,
  limit: LIMIT,
  resetsAt: RESET,
  spend: null,
  used,
  ...extra,
});

const afterReset = (at: number, used: number, extra: Partial<Sample> = {}) =>
  sample(at, used, { resetsAt: RESET + DAY, ...extra });

const spent = (model: string, credits: number, app: string | null = null) => ({
  spend: { app, credits, model } satisfies SpendTag,
});

const timelineOf = (samples: readonly Sample[]): Timeline => {
  const timeline = buildTimeline(samples);
  if (!timeline) {
    throw new Error("expected a timeline");
  }
  return timeline;
};

const usedOf = (timeline: Timeline, period: number): number[] =>
  (timeline[period]?.points ?? []).map((point) => point.used);

test("no samples build no timeline", () => {
  expect(buildTimeline([])).toBeNull();
});

test("unsorted samples with a duplicate become one ascending period", () => {
  const timeline = timelineOf([
    sample(RESET - 6 * HOUR + 2 * HOUR, 20),
    sample(RESET - 6 * HOUR, 10),
    sample(RESET - 6 * HOUR, 10),
    sample(RESET - 6 * HOUR + HOUR, 15),
  ]);
  expect(timeline).toHaveLength(1);
  expect(usedOf(timeline, 0)).toEqual([10, 15, 20]);
  expect(timeline[0]?.startedAt).toBeNull();
});

test("a stale read racing a newer one does not make the line dip", () => {
  const start = RESET - 6 * HOUR;
  const timeline = timelineOf([
    sample(start, 10),
    sample(start + HOUR, 30),
    sample(start + HOUR + 2000, 28),
    sample(start + 2 * HOUR, 40),
  ]);
  expect(timeline).toHaveLength(1);
  expect(usedOf(timeline, 0)).toEqual([10, 30, 30, 40]);
});

test("the old reset instant passing opens a period at that instant", () => {
  const timeline = timelineOf([
    sample(RESET - 2 * HOUR, 90),
    afterReset(RESET + 30 * MIN, 4),
  ]);
  expect(timeline).toHaveLength(2);
  expect(timeline[0]?.resetsAt).toBe(RESET);
  expect(timeline[1]?.startedAt).toBe(RESET);
  expect(timeline[1]?.resetsAt).toBe(RESET + DAY);
  expect(usedOf(timeline, 1)).toEqual([4]);
});

test("a used drop under the same resetsAt is an early reset opened at the sample", () => {
  const dropAt = RESET - 3 * HOUR;
  const timeline = timelineOf([
    sample(RESET - 5 * HOUR, 80),
    sample(dropAt, 2),
    sample(dropAt + HOUR, 9),
  ]);
  expect(timeline).toHaveLength(2);
  expect(timeline[1]?.startedAt).toBe(dropAt);
  expect(usedOf(timeline, 1)).toEqual([2, 9]);
});

test("a small drop is a stale read, not a reset", () => {
  const timeline = timelineOf([
    sample(RESET - 5 * HOUR, 60),
    sample(RESET - 5 * HOUR + 3000, 59),
  ]);
  expect(timeline).toHaveLength(1);
});

test("a resetsAt that jitters by seconds stays one period", () => {
  const timeline = timelineOf([
    sample(RESET - 5 * HOUR, 10),
    sample(RESET - 4 * HOUR, 20, { resetsAt: RESET + 5000 }),
    sample(RESET - 3 * HOUR, 30, { resetsAt: RESET - 2000 }),
  ]);
  expect(timeline).toHaveLength(1);
  expect(timeline[0]?.resetsAt).toBe(RESET + 5000);
});

test("a resetsAt that moves while time has not passed is a rolling window", () => {
  const timeline = timelineOf([
    sample(RESET - 5 * HOUR, 10),
    sample(RESET - 4 * HOUR, 25, { resetsAt: RESET + 3 * HOUR }),
  ]);
  expect(timeline).toHaveLength(1);
  expect(timeline[0]?.resetsAt).toBe(RESET + 3 * HOUR);
});

test("a late read of the period before the reset is dropped", () => {
  const timeline = timelineOf([
    sample(RESET - HOUR, 90),
    afterReset(RESET + 5 * MIN, 3),
    sample(RESET + 10 * MIN, 91),
    afterReset(RESET + 20 * MIN, 5),
  ]);
  expect(timeline).toHaveLength(2);
  expect(usedOf(timeline, 1)).toEqual([3, 5]);
});

test("a sample past the reset that still names it stays in the period", () => {
  const timeline = timelineOf([
    sample(RESET - HOUR, 90),
    sample(RESET + MIN, 92),
  ]);
  expect(timeline).toHaveLength(1);
});

test("a flat run of reads keeps its first and last point", () => {
  const start = RESET - 8 * HOUR;
  const timeline = timelineOf([
    sample(start, 10),
    sample(start + 10 * MIN, 10),
    sample(start + 20 * MIN, 10),
    sample(start + 30 * MIN, 10),
    sample(start + 40 * MIN, 10),
  ]);
  const ats = (timeline[0]?.points ?? []).map((point) => point.at);
  expect(ats).toEqual([start, start + 40 * MIN]);
});

test("burn comes from the used series, per window, inside the period", () => {
  const hoursBefore = (hours: number) => RESET - hours * HOUR;
  const timeline = timelineOf([
    sample(hoursBefore(6), 0),
    sample(hoursBefore(5), 10),
    sample(hoursBefore(4), 10),
    sample(hoursBefore(3), 10),
    sample(hoursBefore(2), 30),
    sample(hoursBefore(1), 50),
  ]);
  expect(forecast(timeline, { burnWindow: 1 }).burnPerHour).toBeCloseTo(20);
  expect(forecast(timeline, { burnWindow: 3 }).burnPerHour).toBeCloseTo(40 / 3);
  expect(forecast(timeline, { burnWindow: 6 }).burnPerHour).toBeCloseTo(10);
});

test("burn after a reset ignores the heavy period before it", () => {
  const timeline = timelineOf([
    sample(RESET - 3 * HOUR, 10),
    sample(RESET - HOUR, 95),
    afterReset(RESET + 10 * MIN, 1),
    afterReset(RESET + 70 * MIN, 3),
  ]);
  expect(forecast(timeline, { burnWindow: 6 }).burnPerHour).toBeCloseTo(2);
});

test("burn is unknown, not zero, when the window holds too little", () => {
  const timeline = timelineOf([sample(RESET - 6 * HOUR, 10)]);
  const result = forecast(timeline, { burnWindow: 3 });
  expect(result.burnPerHour).toBeNull();
  expect(result.empty).toEqual({ kind: "unknown" });
  expect(result.projection).toEqual([]);
});

test("a flat balance is idle", () => {
  const timeline = timelineOf([
    sample(RESET - 8 * HOUR, 10),
    sample(RESET - 6 * HOUR, 10),
  ]);
  const result = forecast(timeline, { burnWindow: 3 });
  expect(result.burnPerHour).toBe(0);
  expect(result.empty).toEqual({ kind: "idle" });
});

test("an empty balance says empty", () => {
  const timeline = timelineOf([
    sample(RESET - 8 * HOUR, 70),
    sample(RESET - 6 * HOUR, 100),
  ]);
  expect(forecast(timeline, { burnWindow: 3 }).empty).toEqual({
    kind: "empty",
  });
});

test("a burn that empties the balance before the reset names the time", () => {
  const now = RESET - 6 * HOUR;
  const timeline = timelineOf([sample(RESET - 8 * HOUR, 0), sample(now, 60)]);
  const result = forecast(timeline, { burnWindow: 3 });
  expect(result.burnPerHour).toBeCloseTo(30);
  expect(result.remaining).toBe(40);
  expect(result.empty).toEqual({ at: now + 80 * MIN, kind: "at" });
  expect(result.nextReset).toEqual({ at: RESET, refill: LIMIT });
});

test("a burn that lasts past the reset says not before reset", () => {
  const timeline = timelineOf([
    sample(RESET - 8 * HOUR, 0),
    sample(RESET - 6 * HOUR, 20),
  ]);
  const result = forecast(timeline, { burnWindow: 3 });
  expect(result.empty).toEqual({ kind: "before-reset", resetsAt: RESET });
  expect(result.nextReset.refill).toBeCloseTo(80);
});

test("the projection steps up by the limit at each reset and never goes below zero", () => {
  const timeline = timelineOf([
    sample(RESET - 8 * HOUR, 0),
    sample(RESET - 6 * HOUR, 20),
  ]);
  const now = RESET - 6 * HOUR;
  expect(forecast(timeline, { burnWindow: 3 }).projection).toEqual([
    { at: now, remaining: 80 },
    { at: RESET, remaining: 20 },
    { at: RESET, remaining: LIMIT },
    { at: RESET + 10 * HOUR, remaining: 0 },
    { at: RESET + DAY, remaining: 0 },
  ]);
});

test("a longer horizon draws one step per reset inside it", () => {
  const timeline = timelineOf([
    sample(RESET - 8 * HOUR, 0),
    sample(RESET - 6 * HOUR, 20),
  ]);
  const { projection } = forecast(timeline, {
    burnWindow: 3,
    horizonPeriods: 2,
  });
  const steps = projection.filter(
    (point, index) =>
      point.remaining === LIMIT && projection[index - 1]?.at === point.at
  );
  expect(steps.map((point) => point.at)).toEqual([RESET, RESET + DAY]);
  expect(projection.at(-1)).toEqual({ at: RESET + 2 * DAY, remaining: 0 });
});

test("the period length follows two observed resets", () => {
  const week = 7 * DAY;
  const timeline = timelineOf([
    sample(RESET - HOUR, 50),
    sample(RESET + HOUR, 5, { resetsAt: RESET + week }),
    sample(RESET + 3 * HOUR, 15, { resetsAt: RESET + week }),
  ]);
  const result = forecast(timeline, { burnWindow: 3 });
  expect(result.nextReset.at).toBe(RESET + week);
  const last = result.projection.at(-1);
  expect(last?.at).toBe(RESET + 2 * week);
});

test("out-of-order reads from concurrent turns do not move the burn", () => {
  const start = RESET - 4 * HOUR;
  const clean = [
    sample(start, 10),
    sample(start + HOUR, 20),
    sample(start + 2 * HOUR, 30),
    sample(start + 3 * HOUR, 40),
  ];
  const racing = [
    ...clean,
    sample(start + 3 * HOUR - 1500, 37),
    sample(start + HOUR + 2000, 18),
  ];
  expect(
    forecast(timelineOf(racing), { burnWindow: 3 }).burnPerHour
  ).toBeCloseTo(
    forecast(timelineOf(clean), { burnWindow: 3 }).burnPerHour ?? 0
  );
});

test("spend scales overlapping claims down to what the counter rose by", () => {
  const timeline = timelineOf([
    sample(RESET - HOUR, 70),
    afterReset(RESET + HOUR, 30, spent("gpt-5.5", 30, "codex")),
    afterReset(RESET + HOUR + 1000, 40, spent("gemini-3.5-flash", 30)),
  ]);
  const spend = spendOf(timeline);
  const afterResetSpend = spend.byModel.map((share) => share.credits);
  expect(afterResetSpend[0]).toBeCloseTo(20);
  expect(afterResetSpend[1]).toBeCloseTo(20);
  expect(spend.byApp.at(-1)).toEqual({ credits: 20, key: null });
  expect(spend.total).toBe(40);
});

test("spend no completion claims lands in outside", () => {
  const timeline = timelineOf([
    sample(RESET - HOUR, 0),
    afterReset(RESET + HOUR, 25, spent("gpt-5.5", 25, "codex")),
    afterReset(RESET + 2 * HOUR, 40),
  ]);
  const spend = spendOf(timeline);
  expect(spend.total).toBe(40);
  expect(spend.byModel).toEqual([{ credits: 25, key: "gpt-5.5" }]);
  expect(spend.outside).toBeCloseTo(15);
});

test("recording that began mid-period counts only what it watched", () => {
  const timeline = timelineOf([
    sample(RESET - 6 * HOUR, 60, spent("gpt-5.5", 5)),
    sample(RESET - 3 * HOUR, 75, spent("gpt-5.5", 10)),
  ]);
  const spend = spendOf(timeline);
  expect(spend.total).toBe(20);
  expect(spend.byModel).toEqual([{ credits: 15, key: "gpt-5.5" }]);
  expect(spend.outside).toBeCloseTo(5);
});

test("spend adds up across periods and lists no-app last", () => {
  const timeline = timelineOf([
    sample(RESET - 2 * HOUR, 20, spent("a", 20, null)),
    afterReset(RESET + HOUR, 8, spent("a", 8, "codex")),
    afterReset(RESET + 2 * HOUR, 10, spent("b", 2, "codex")),
  ]);
  const spend = spendOf(timeline);
  expect(spend.byModel.map((share) => share.key)).toEqual(["a", "b"]);
  expect(spend.byApp.map((share) => share.key)).toEqual(["codex", null]);
});

const TEN_THOUSAND = 10_000;
const WEEK = 7 * DAY;

/** A week of reads about every minute, a daily reset, and a tagged completion every tenth. */
const busyWeek = (now: number): Sample[] => {
  const step = WEEK / TEN_THOUSAND;
  return Array.from({ length: TEN_THOUSAND }, (_, index) => {
    const at = now - WEEK + index * step;
    const day = Math.floor((at - RESET) / DAY);
    const resetsAt = RESET + (day + 1) * DAY;
    const intoDay = at - (RESET + day * DAY);
    const used = Math.min(LIMIT, (intoDay / DAY) * 90);
    const tag = index % 10 === 0 ? spent("gpt-5.5", 0.5, "codex") : null;
    return sample(at, used, { resetsAt, spend: tag?.spend ?? null });
  });
};

test("ten thousand readings thin to a few hundred and keep every reset", () => {
  const now = RESET + 2 * DAY + 5 * HOUR;
  const readings = busyWeek(now);
  const thinned = thin(readings, now);
  expect(thinned.length).toBeLessThan(2000);

  const full = timelineOf(readings);
  const small = timelineOf(thinned);
  expect(small).toHaveLength(full.length);
  expect(small.map((period) => period.startedAt)).toEqual(
    full.map((period) => period.startedAt)
  );
  expect(small.map((period) => period.resetsAt)).toEqual(
    full.map((period) => period.resetsAt)
  );
});

test("thinning keeps the last six hours whole and the spend totals intact", () => {
  const now = RESET + 2 * DAY + 5 * HOUR;
  const readings = busyWeek(now);
  const thinned = thin(readings, now);
  const recent = (list: readonly Sample[]) =>
    list.filter((entry) => entry.at >= now - 6 * HOUR).length;
  expect(recent(thinned)).toBe(recent(readings));

  const before = spendOf(timelineOf(readings));
  const after = spendOf(timelineOf(thinned));
  expect(after.total).toBeCloseTo(before.total);
  expect(after.byModel[0]?.credits).toBeCloseTo(
    before.byModel[0]?.credits ?? 0
  );
  expect(after.outside).toBeCloseTo(before.outside);
});

test("a tuple round-trips a sample with and without spend", () => {
  const plain = sample(RESET - HOUR, 12.5);
  const tagged = sample(RESET - HOUR, 12.5, spent("gpt-5.5", 3.25, "codex"));
  expect(fromTuple(toTuple(plain))).toEqual(plain);
  expect(fromTuple(toTuple(tagged))).toEqual(tagged);
});

test("the wire schema refuses a malformed tuple", () => {
  const live = toTuple(sample(RESET, 1));
  expect(
    historyResponseSchema.safeParse({ live, samples: [live], store: "ready" })
      .success
  ).toBe(true);
  expect(
    historyResponseSchema.safeParse({
      live,
      samples: [["x", 1, 1, 1, null, null, null]],
      store: "ready",
    }).success
  ).toBe(false);
  expect(
    historyResponseSchema.safeParse({ live, samples: [], store: "maybe" })
      .success
  ).toBe(false);
});

test("credits with an unreadable reset time make no sample", () => {
  const credits = {
    creditsAvailable: 90,
    creditsLimit: 100,
    creditsResetAt: "soon",
    creditsUsed: 10,
  };
  expect(sampleFromCredits(credits, RESET)).toBeNull();
  expect(
    sampleFromCredits({ ...credits, creditsResetAt: "2026-09-04T00:00:00Z" }, 1)
  ).toEqual(sample(1, 10));
});

test("a decoded history ends at the live balance", () => {
  const live = toTuple(sample(RESET - HOUR, 30));
  const stored = toTuple(sample(RESET - 2 * HOUR, 10));
  const history = decodeHistory({ live, samples: [stored], store: "ready" });
  expect(history.store).toBe("ready");
  expect(usedOf(history.timeline, 0)).toEqual([10, 30]);
  const empty = decodeHistory({ live, samples: [], store: "off" });
  expect(usedOf(empty.timeline, 0)).toEqual([30]);
});
