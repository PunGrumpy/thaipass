import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  identityResponse,
  quotaResponse,
  routes,
  sseResponse,
  stubUpstream,
  textDeltas,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";

import { app } from "../app";
import { createHistory, useHistory } from "../lib/history";
import { memoryStore, upstashStore } from "../lib/history-store";

const KV_URL = "https://kv.test";
const LIMIT = 10_000;
const USED_BEFORE = 100;
const USED_AFTER = 130.25;
const USER = "user_recording";

let accounts = 0;
let cookie = "";
let upstream: Upstream;
let restoreHistory: () => void;

beforeEach(() => {
  accounts += 1;
  cookie = `__Secure-ai_passport_auth.session_token=recording${accounts}.def`;
});

afterEach(() => {
  upstream.restore();
  restoreHistory();
});

const chat = (stream: boolean): Request =>
  new Request("https://proxy.test/v1/chat/completions", {
    body: JSON.stringify({
      messages: [{ content: "hi", role: "user" }],
      stream,
    }),
    headers: {
      authorization: `Bearer ${cookie}`,
      "content-type": "application/json",
      "x-thaipass-app": "codex",
    },
    method: "POST",
  });

const recordedSamples = (store: ReturnType<typeof memoryStore>) =>
  Object.values(store.dump())[0] ?? [];

test("a streamed completion records its settled balance with what it spent", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(2)),
    routes(
      quotaResponse([USED_BEFORE, USED_AFTER], LIMIT),
      identityResponse(USER)
    )
  );
  const store = memoryStore();
  restoreHistory = useHistory(createHistory(store, { now: Date.now }));
  const response = await app.fetch(chat(true));
  const text = await response.text();
  expect(text).toContain("data: [DONE]");
  const [sample] = recordedSamples(store);
  expect(sample?.[1]).toBe(USED_AFTER);
  expect(sample?.[2]).toBe(LIMIT);
  expect(sample?.[4]).toEqual(expect.any(String));
  expect(sample?.[5]).toBe("codex");
  expect(sample?.[6]).toBeCloseTo(USED_AFTER - USED_BEFORE);
});

test("a buffered completion records the same", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    routes(
      quotaResponse([USED_BEFORE, USED_AFTER], LIMIT),
      identityResponse(USER)
    )
  );
  const store = memoryStore();
  restoreHistory = useHistory(createHistory(store, { now: Date.now }));
  const response = await app.fetch(chat(false));
  expect(response.status).toBe(200);
  const samples = recordedSamples(store);
  expect(samples).toHaveLength(1);
  expect(samples[0]?.[1]).toBe(USED_AFTER);
  expect(samples[0]?.[5]).toBe("codex");
});

test("a completion whose store answers 500 still ends the stream with [DONE]", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(2)),
    routes(
      quotaResponse([USED_BEFORE, USED_AFTER], LIMIT),
      identityResponse(USER),
      (path) =>
        path.startsWith(KV_URL)
          ? new Response("boom", { status: 500 })
          : undefined
    )
  );
  restoreHistory = useHistory(
    createHistory(upstashStore({ token: "t", url: KV_URL }), {
      now: Date.now,
    })
  );
  const response = await app.fetch(chat(true));
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).toContain('"content":"chunk0"');
  expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
  expect(upstream.calls.some((path) => path.startsWith(KV_URL))).toBe(true);
});

test("a store that is off adds no upstream call to a completion", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], LIMIT)
  );
  restoreHistory = useHistory(createHistory(null, { now: Date.now }));
  await app.fetch(chat(false));
  expect(upstream.calls.filter((path) => path.startsWith(KV_URL))).toEqual([]);
});

test("a /v1/usage read is recorded", async () => {
  upstream = stubUpstream(
    sseResponse([]),
    routes(quotaResponse([USED_BEFORE], LIMIT), identityResponse(USER))
  );
  const store = memoryStore();
  restoreHistory = useHistory(createHistory(store, { now: Date.now }));
  const response = await app.fetch(
    new Request("https://proxy.test/v1/usage", {
      headers: { authorization: `Bearer ${cookie}` },
    })
  );
  expect(response.status).toBe(200);
  expect(recordedSamples(store).map((sample) => sample[1])).toEqual([
    USED_BEFORE,
  ]);
});

test("a T3 Code usage poll is recorded", async () => {
  upstream = stubUpstream(
    sseResponse([]),
    routes(quotaResponse([USED_BEFORE], LIMIT), identityResponse(USER))
  );
  const store = memoryStore();
  restoreHistory = useHistory(createHistory(store, { now: Date.now }));
  const response = await app.fetch(
    new Request("https://proxy.test/v0/management/api-call", {
      body: JSON.stringify({
        auth_index: "0",
        method: "GET",
        url: "https://chatgpt.com/backend-api/wham/usage",
      }),
      headers: {
        authorization: `Bearer ${cookie}`,
        "content-type": "application/json",
      },
      method: "POST",
    })
  );
  expect(response.status).toBe(200);
  expect(recordedSamples(store).map((sample) => sample[1])).toEqual([
    USED_BEFORE,
  ]);
});
