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
const USED = 2500;
const LIMIT = 10_000;
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

const authFilesRequest = (headers: Record<string, string> = {}): Request =>
  new Request("https://proxy.test/v0/management/auth-files", { headers });

const apiCallRequest = (url: string, method = "GET"): Request =>
  new Request("https://proxy.test/v0/management/api-call", {
    body: JSON.stringify({ auth_index: "0", header: {}, method, url }),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

const authFilesSchema = z.object({
  files: z.array(
    z.object({ auth_index: z.string(), id: z.string(), provider: z.string() })
  ),
});

const apiCallSchema = z.object({ body: z.string(), status_code: z.number() });

const usageSchema = z.object({
  rate_limit: z.object({
    primary_window: z.object({
      limit_window_seconds: z.number(),
      reset_at: z.number().nullable(),
      used_percent: z.number(),
    }),
  }),
});

test("lists the account behind the cookie as one Codex account", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await app.fetch(
    authFilesRequest({ authorization: `Bearer ${COOKIE}` })
  );
  const { files } = authFilesSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(files).toHaveLength(1);
  expect(files[0]?.provider).toBe("codex");
  expect(files[0]?.auth_index).toBe("0");
});

test("rejects a management request without the cookie", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await app.fetch(authFilesRequest());
  expect(response.status).toBe(401);
});

test("answers the Codex usage call with the credit balance as a daily window", async () => {
  upstream = stubUpstream(sseResponse([]), quotaResponse([USED], LIMIT));
  const response = await app.fetch(apiCallRequest(USAGE_URL));
  const call = apiCallSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(call.status_code).toBe(200);
  const window = usageSchema.parse(JSON.parse(call.body)).rate_limit
    .primary_window;
  expect(window.used_percent).toBe((USED / LIMIT) * 100);
  expect(window.limit_window_seconds).toBe(86_400);
  expect(window.reset_at).toBeGreaterThan(0);
});

test("answers any other upstream call with a 404 inside the envelope", async () => {
  upstream = stubUpstream(sseResponse([]), quotaResponse([USED], LIMIT));
  const response = await app.fetch(
    apiCallRequest(
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"
    )
  );
  const call = apiCallSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(call.status_code).toBe(404);
});

test("reports a 502 inside the envelope when AI Pass has no balance", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await app.fetch(apiCallRequest(USAGE_URL));
  const call = apiCallSchema.parse(await response.json());
  expect(call.status_code).toBe(502);
  expect(call.body).toContain("stale");
});
