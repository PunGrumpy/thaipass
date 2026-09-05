import { afterEach, expect, test } from "bun:test";

import { z } from "zod";

import { app } from "../app";
import type { Payload } from "../lms/payload";
import { sseResponse, stubUpstream } from "../testing/upstream";
import type { Upstream } from "../testing/upstream";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const LMS = "/lms/api/v1";
const MONTHLY = 40;

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

const errorSchema = z.object({ error: z.object({ message: z.string() }) });

const expSchema = z.object({
  achievement: z.unknown(),
  monthly: z.number().nullable(),
  session_exp: z.unknown(),
  session_tier: z.unknown(),
});

const lineSchema = z.looseObject({ event: z.string() });

const ok = (data: Payload): Response => Response.json({ data, success: true });

const unauthorized = (): Response =>
  Response.json(
    { code: "INVALID_CREDENTIAL", statusCode: 401, success: false },
    { status: 401 }
  );

const lmsUpstream = (deadCookie = false): Upstream =>
  stubUpstream(sseResponse([]), (path) => {
    if (!path.startsWith(LMS)) {
      return;
    }
    if (deadCookie) {
      return unauthorized();
    }
    const route = path.slice(LMS.length);
    if (route === "/session/session-exp") {
      return ok({ monthlyExp: MONTHLY });
    }
    if (route === "/achievement") {
      return ok({ courses: 2 });
    }
    if (route === "/course/v2") {
      return ok({ courses: [], total: 0 });
    }
    return ok({});
  });

const get = (headers: Record<string, string> = {}): Request =>
  new Request("https://proxy.test/v1/lms/exp", { headers });

const learnRequest = (
  body: Record<string, boolean | number>,
  headers: Record<string, string> = {}
) =>
  new Request("https://proxy.test/v1/lms/learn", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

test("refuses to read EXP without the session cookie", async () => {
  upstream = lmsUpstream();
  const response = await app.fetch(get());
  expect(response.status).toBe(401);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "missing Authorization"
  );
});

test("reads the EXP behind a bearer cookie", async () => {
  upstream = lmsUpstream();
  const response = await app.fetch(get({ authorization: `Bearer ${COOKIE}` }));
  expect(response.status).toBe(200);
  const body = expSchema.parse(await response.json());
  expect(body.monthly).toBe(MONTHLY);
  expect(body.achievement).toEqual({ courses: 2 });
  const sent = upstream.sent.find((call) => call.path.endsWith("/session-exp"));
  expect(sent?.method).toBe("GET");
});

test("answers 502 when the LMS refuses the cookie", async () => {
  upstream = lmsUpstream(true);
  const response = await app.fetch(get({ authorization: `Bearer ${COOKIE}` }));
  expect(response.status).toBe(502);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "401"
  );
});

test("refuses to learn without the session cookie", async () => {
  upstream = lmsUpstream();
  const response = await app.fetch(learnRequest({}));
  expect(response.status).toBe(401);
});

test("rejects a pace or target outside the range", async () => {
  upstream = lmsUpstream();
  const response = await app.fetch(
    learnRequest({ pace: 0 }, { authorization: `Bearer ${COOKIE}` })
  );
  expect(response.status).toBe(400);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "invalid request body"
  );
});

test("streams the run as one JSON object per line and ends on done", async () => {
  upstream = lmsUpstream();
  const response = await app.fetch(
    learnRequest(
      { dry_run: true, target: 50 },
      { authorization: `Bearer ${COOKIE}` }
    )
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain(
    "application/x-ndjson"
  );
  const text = await response.text();
  const lines = text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => lineSchema.parse(JSON.parse(line)));
  expect(lines[0]?.event).toBe("exp");
  const done = lines.at(-1);
  expect(done?.event).toBe("done");
  expect(done?.target).toBe(50);
  expect(done?.reached).toBe(false);
  expect(done?.paused).toBe(false);
});
