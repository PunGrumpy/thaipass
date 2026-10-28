import { describe, expect, it } from "bun:test";

import { buildTimeline, forecast } from "@thaipass/core/aipass/history";
import type { Sample } from "@thaipass/core/aipass/history";

import { toChartModel } from "./credit-chart";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RESET = Date.parse("2026-09-04T00:00:00.000Z");

const sample = (at: number, used: number, resetsAt = RESET): Sample => ({
  at,
  limit: 100,
  resetsAt,
  spend: null,
  used,
});

const modelOf = (samples: readonly Sample[]) => {
  const timeline = buildTimeline(samples);
  if (!timeline) {
    throw new Error("expected a timeline");
  }
  return toChartModel(timeline, forecast(timeline, { burnWindow: 3 }));
};

describe("toChartModel", () => {
  const model = modelOf([
    sample(RESET - 8 * HOUR, 0),
    sample(RESET - 6 * HOUR, 40),
    sample(RESET + HOUR, 5, RESET + DAY),
    sample(RESET + 3 * HOUR, 15, RESET + DAY),
  ]);

  it("steps up vertically at an observed reset", () => {
    const atReset = model.rows.filter((row) => row.at === RESET);
    expect(atReset.map((row) => row.recorded)).toEqual([100]);
    const before = model.rows.findLast((row) => row.at < RESET);
    expect(before?.recorded).toBe(60);
  });

  it("shares the now row between the recorded and projected lines", () => {
    const now = model.rows.filter((row) => row.at === model.now);
    expect(now).toHaveLength(1);
    expect(now[0]?.recorded).toBe(85);
    expect(now[0]?.projected).toBe(85);
  });

  it("keeps the projection off the recorded line", () => {
    const later = model.rows.filter((row) => row.at > model.now);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((row) => row.recorded === null)).toBe(true);
    expect(
      model.rows
        .filter((row) => row.at < model.now)
        .every((row) => row.projected === null)
    ).toBe(true);
  });

  it("marks the observed and the projected reset with their refill", () => {
    expect(model.resets[0]).toEqual({
      at: RESET,
      projected: false,
      refill: 40,
    });
    const projected = model.resets.filter((reset) => reset.projected);
    expect(projected.map((reset) => reset.at)).toEqual([RESET + DAY]);
    expect(projected[0]?.refill).toBeGreaterThan(0);
  });

  it("tops the y axis at the limit", () => {
    expect(model.ceiling).toBe(100);
  });
});

describe("toChartModel when the burn is unknown", () => {
  it("draws only the recorded line and no empty-at dot", () => {
    const only = modelOf([sample(RESET - 6 * HOUR, 40)]);
    expect(only.rows).toEqual([
      { at: RESET - 6 * HOUR, projected: null, recorded: 60 },
    ]);
    expect(only.emptyAt).toBeNull();
  });
});
