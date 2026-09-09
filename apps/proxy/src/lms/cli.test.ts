import { expect, test } from "bun:test";

import { describe, parseCliArgs, resolveCookie, UsageError } from "./cli";

const COOKIE = "app_lang=th; __Secure-ai_passport_auth.session_token=abc.def";

test("parses the flags and leaves the rest to the learner's defaults", () => {
  expect(parseCliArgs([])).toEqual({
    articles: true,
    attachments: true,
    cookieFile: undefined,
    dryRun: false,
    earn: undefined,
    help: false,
    json: false,
    maxLessons: undefined,
    pace: undefined,
    target: undefined,
  });
  expect(
    parseCliArgs([
      "-t",
      "150",
      "--earn",
      "200",
      "--pace",
      "2",
      "-m",
      "3",
      "--dry-run",
      "--json",
    ])
  ).toMatchObject({
    dryRun: true,
    earn: 200,
    json: true,
    maxLessons: 3,
    pace: 2,
    target: 150,
  });
});

test("refuses a pace or target that is not a positive number", () => {
  expect(() => parseCliArgs(["--pace", "0"])).toThrow(UsageError);
  expect(() => parseCliArgs(["--pace", "99"])).toThrow("up to 16");
  expect(() => parseCliArgs(["--target", "lots"])).toThrow(UsageError);
  expect(() => parseCliArgs(["--nope"])).toThrow(UsageError);
});

test("reads the cookie from the environment, or from a file when named", async () => {
  expect(await resolveCookie(undefined, COOKIE)).toBe(COOKIE);
  const file = `/tmp/aipass-cookie-${crypto.randomUUID()}`;
  await Bun.write(file, `${COOKIE}\n`);
  expect(await resolveCookie(file)).toBe(COOKIE);
});

test("names what is missing when there is no usable cookie", async () => {
  await expect(resolveCookie()).rejects.toThrow("AIPASS_COOKIE");
  await expect(resolveCookie(undefined, "token=abc")).rejects.toThrow(
    "__Secure-ai_passport_auth.session_token"
  );
});

test("describes a run in a few lines and keeps stamps transient", () => {
  expect(describe({ event: "exp", monthly: 325, phase: "before" })?.text).toBe(
    "EXP this period: 325"
  );
  expect(
    describe({ event: "exp", monthly: 325, phase: "after" })
  ).toBeUndefined();
  expect(
    describe({ code: "56", event: "course", lessons: 10, title: "AI" })?.text
  ).toBe("course 56 · AI — 10 lessons");
  expect(
    describe({
      code: "56",
      duration: 348,
      event: "lesson",
      kind: "video",
      lesson: "l-1",
      status: "started",
      title: "Intro",
      watched: 270,
    })?.text
  ).toBe("  ▶ Intro (5:48), resuming from 4:30");
  const stamp = describe({
    at: 280,
    code: "56",
    duration: 348,
    event: "stamp",
    lesson: "l-1",
    status: "IN_PROGRESS",
  });
  expect(stamp?.transient).toBe(true);
  expect(stamp?.text).toContain("4:40 / 5:48  80%");
  expect(
    describe({
      code: "56",
      earned: 100,
      event: "lesson",
      exp: 100,
      kind: "video",
      lesson: "l-1",
      monthly: 425,
      status: "completed",
      title: "Intro",
    })?.text
  ).toBe("  ✓ Intro — +100 EXP (period 425)");
  expect(
    describe({
      earned: 100,
      event: "done",
      lessons: 1,
      monthly: 425,
      paused: false,
      reached: true,
      reason: "target reached",
      target: 100,
    })?.text
  ).toBe("done: +100 EXP in 1 lesson · period 425 · target reached");
  const error = describe({
    code: null,
    detail: "body",
    event: "error",
    fatal: true,
    message: "refused",
    scope: "lesson",
    status: 400,
  });
  expect(error?.stderr).toBe(true);
  expect(error?.text).toContain("refused");
});
