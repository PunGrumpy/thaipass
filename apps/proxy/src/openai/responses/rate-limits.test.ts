import { expect, test } from "bun:test";

import { codexLimitHeaders } from "./rate-limits";

const RESET_AT = "2026-09-25T19:00:00.000Z";
const RESET_SECONDS = "1790362800";

test("reports a spent balance as a full window with no credits left", () => {
  expect(
    codexLimitHeaders({
      creditsAvailable: 0,
      creditsLimit: 10_000,
      creditsResetAt: RESET_AT,
      creditsUsed: 10_000,
    })
  ).toEqual({
    "x-codex-credits-balance": "0",
    "x-codex-credits-has-credits": "false",
    "x-codex-credits-unlimited": "false",
    "x-codex-primary-reset-at": RESET_SECONDS,
    "x-codex-primary-used-percent": "100",
    "x-codex-primary-window-minutes": "1440",
  });
});

test("caps the used percent at 100 when upstream overdraws", () => {
  const headers = codexLimitHeaders({
    creditsAvailable: 0,
    creditsLimit: 100,
    creditsResetAt: RESET_AT,
    creditsUsed: 150,
  });
  expect(headers["x-codex-primary-used-percent"]).toBe("100");
});

test("leaves out what it cannot work out rather than guessing", () => {
  const headers = codexLimitHeaders({
    creditsAvailable: 0,
    creditsLimit: 0,
    creditsResetAt: "soon",
    creditsUsed: 0,
  });
  expect(headers["x-codex-primary-used-percent"]).toBeUndefined();
  expect(headers["x-codex-primary-reset-at"]).toBeUndefined();
});
