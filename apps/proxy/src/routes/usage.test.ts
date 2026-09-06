import { afterEach, expect, test } from "bun:test";

import {
  quotaResponse,
  sseResponse,
  stubUpstream,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import { app } from "../app";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const USED = 1234.5;
const LIMIT = 10_000;

let upstream: Upstream;

const usageRequest = (headers: Record<string, string> = {}): Request =>
  new Request("https://proxy.test/v1/usage", { headers });

const balanceSchema = z.object({
  available: z.number(),
  limit: z.number(),
  reset_at: z.string(),
  used: z.number(),
});

const errorSchema = z.object({ error: z.object({ message: z.string() }) });

afterEach(() => {
  upstream.restore();
});

test("rejects a request without the session cookie", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await app.fetch(usageRequest());
  expect(response.status).toBe(401);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "missing Authorization"
  );
});

test("reports the credit balance behind a bearer cookie", async () => {
  upstream = stubUpstream(sseResponse([]), quotaResponse([USED], LIMIT));
  const response = await app.fetch(
    usageRequest({ authorization: `Bearer ${COOKIE}` })
  );
  const body = balanceSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(body.used).toBe(USED);
  expect(body.limit).toBe(LIMIT);
  expect(body.available).toBe(LIMIT - USED);
  expect(body.reset_at.length).toBeGreaterThan(0);
});

test("accepts the cookie as x-api-key", async () => {
  upstream = stubUpstream(sseResponse([]), quotaResponse([USED], LIMIT));
  const response = await app.fetch(usageRequest({ "x-api-key": COOKIE }));
  expect(response.status).toBe(200);
});

test("answers 502 when AI Pass reports no balance", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await app.fetch(
    usageRequest({ authorization: `Bearer ${COOKIE}` })
  );
  expect(response.status).toBe(502);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "stale"
  );
});
