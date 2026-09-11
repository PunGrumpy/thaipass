import { describe, expect, it } from "bun:test";

import {
  formatClock,
  formatDuration,
  formatPercent,
  formatPlural,
  formatRatePerMillion,
  formatUsd,
} from "./format";

describe("formatUsd", () => {
  it("formats zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("formats tiny amounts under 0.0001", () => {
    expect(formatUsd(0.000045)).toBe("<$0.0001");
  });

  it("formats small amounts under 0.01 with 4 decimals", () => {
    expect(formatUsd(0.0014)).toBe("$0.0014");
    expect(formatUsd(0.0099)).toBe("$0.0099");
  });

  it("formats amounts >= 0.01 with 2 decimals", () => {
    expect(formatUsd(0.01)).toBe("$0.01");
    expect(formatUsd(1.256)).toBe("$1.26");
    expect(formatUsd(10.5)).toBe("$10.50");
  });
});

describe("formatRatePerMillion", () => {
  it("formats zero", () => {
    expect(formatRatePerMillion(0)).toBe("$0.00");
  });

  it("formats standard per-million rates", () => {
    expect(formatRatePerMillion(0.000003)).toBe("$3.00");
    expect(formatRatePerMillion(0.000015)).toBe("$15.00");
    expect(formatRatePerMillion(0.00000015)).toBe("$0.15");
  });

  it("formats very small per-million rates", () => {
    expect(formatRatePerMillion(0.000000005)).toBe("$0.0050");
  });
});

describe("existing formatters", () => {
  it("formats percentage", () => {
    expect(formatPercent(50, 100)).toBe(50);
    expect(formatPercent(0, 0)).toBe(0);
  });

  it("formats clock and duration", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatDuration(3600)).toBe("1h");
  });

  it("formats plural", () => {
    expect(formatPlural(1, "model")).toBe("1 model");
    expect(formatPlural(2, "model")).toBe("2 models");
  });
});
