import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test";

import {
  buildTimeline,
  fromTuple,
  historyResponseSchema,
  toTuple,
} from "@thaipass/core/aipass/history";
import type { Sample } from "@thaipass/core/aipass/history";
import { generateTokenKey, seal } from "@thaipass/core/auth/seal";
import {
  identityResponse,
  quotaResponse,
  routes,
  sseResponse,
  stubUpstream,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { Elysia } from "elysia";

import { app } from "../app";
import { accountKey, createHistory, useHistory } from "../lib/history";
import type { History } from "../lib/history";
import { memoryStore } from "../lib/history-store";
import type { HistoryStore } from "../lib/history-store";
import { creditHistoryRoutes } from "./credit-history";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RESET = Date.parse("2026-09-04T00:00:00.000Z");
const NOW = RESET - 4 * HOUR;
const LIMIT = 1000;
const USER = "user_history";

let accounts = 0;
let cookie = "";
let upstream: Upstream;
let restoreHistory: (() => void) | undefined;
let previousKey: string | undefined;

beforeEach(() => {
  accounts += 1;
  cookie = `__Secure-ai_passport_auth.session_token=history${accounts}.secret`;
  previousKey = process.env.THAIPASS_TOKEN_KEY;
  setSystemTime(new Date(NOW));
});

afterEach(() => {
  upstream.restore();
  restoreHistory?.();
  restoreHistory = undefined;
  process.env.THAIPASS_TOKEN_KEY = previousKey ?? "";
  setSystemTime();
});

const stub = (used: readonly number[]) => {
  upstream = stubUpstream(
    sseResponse([]),
    routes(quotaResponse(used, LIMIT), identityResponse(USER))
  );
};

const mount = (history: History) =>
  new Elysia().use(creditHistoryRoutes(history));

const get = (
  target: { fetch: (request: Request) => Response | Promise<Response> },
  authorization = `Bearer ${cookie}`
) =>
  target.fetch(
    new Request("https://proxy.test/v1/usage/history", {
      headers: { authorization },
    })
  );

const sample = (at: number, used: number, resetsAt = RESET): Sample => ({
  at,
  limit: LIMIT,
  resetsAt,
  spend: null,
  used,
});

const seed = async (store: HistoryStore, samples: readonly Sample[]) => {
  await Promise.all(
    samples.map((entry) =>
      store.append(accountKey({ userId: USER }), toTuple(entry))
    )
  );
};

test("rejects a request without the session cookie", async () => {
  stub([100]);
  const response = await mount(createHistory(null, { now: Date.now })).fetch(
    new Request("https://proxy.test/v1/usage/history")
  );
  expect(response.status).toBe(401);
});

test("answers 502 when AI Pass reports no balance", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await get(mount(createHistory(null, { now: Date.now })));
  expect(response.status).toBe(502);
});

test("with no store it says off and still returns the live balance", async () => {
  stub([250]);
  const response = await get(mount(createHistory(null, { now: Date.now })));
  const body = historyResponseSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(body.store).toBe("off");
  expect(body.samples).toEqual([]);
  expect(fromTuple(body.live)).toEqual(sample(NOW, 250));
  expect(upstream.calls.filter((path) => path.includes("session"))).toEqual([]);
});

test("with a store it returns what was recorded and records the live balance", async () => {
  stub([300]);
  const store = memoryStore();
  await seed(store, [sample(NOW - 3 * HOUR, 100), sample(NOW - HOUR, 200)]);
  const history = createHistory(store, { now: Date.now });
  const response = await get(mount(history));
  const body = historyResponseSchema.parse(await response.json());
  expect(body.store).toBe("ready");
  expect(body.samples.map((tuple) => tuple[1])).toEqual([100, 200]);
  expect(fromTuple(body.live).used).toBe(300);
  const stored = Object.values(store.dump())[0] ?? [];
  expect(stored.map((tuple) => tuple[1])).toEqual([100, 200, 300]);
});

test("polling an unchanged balance does not pile up samples", async () => {
  stub([300]);
  const store = memoryStore();
  const history = createHistory(store, { now: Date.now });
  const target = mount(history);
  await get(target);
  setSystemTime(new Date(NOW + MIN));
  await get(target);
  setSystemTime(new Date(NOW + 2 * MIN));
  await get(target);
  expect(Object.values(store.dump())[0]).toHaveLength(1);
});

test("a store that errors still answers 200 with the live balance and says down", async () => {
  stub([300]);
  const broken: HistoryStore = {
    append: () => Promise.reject(new Error("500")),
    read: () => Promise.reject(new Error("500")),
  };
  const response = await get(mount(createHistory(broken, { now: Date.now })));
  const body = historyResponseSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(body.store).toBe("down");
  expect(body.samples).toEqual([]);
  expect(fromTuple(body.live).used).toBe(300);
});

test("an account that cannot be identified reads as down", async () => {
  upstream = stubUpstream(sseResponse([]), quotaResponse([300], LIMIT));
  const store = memoryStore();
  const response = await get(mount(createHistory(store, { now: Date.now })));
  const body = historyResponseSchema.parse(await response.json());
  expect(body.store).toBe("down");
  expect(store.dump()).toEqual({});
});

test("the series of one account is not visible to another", async () => {
  stub([300]);
  const store = memoryStore();
  await seed(store, [sample(NOW - HOUR, 200)]);
  const history = createHistory(store, { now: Date.now });
  upstream.restore();
  upstream = stubUpstream(
    sseResponse([]),
    routes(quotaResponse([50], LIMIT), identityResponse("someone_else"))
  );
  const response = await get(mount(history));
  const body = historyResponseSchema.parse(await response.json());
  expect(body.samples).toEqual([]);
});

test("nothing credential-shaped reaches the store", async () => {
  stub([300]);
  const store = memoryStore();
  await get(mount(createHistory(store, { now: Date.now })));
  const at = JSON.stringify(store.dump());
  expect(at).not.toContain("secret");
  expect(at).not.toContain("session_token");
  expect(at).not.toContain("reader@example.com");
  expect(at).not.toContain(USER);
});

test("ten thousand readings come back thinned with every reset kept", async () => {
  stub([800]);
  const store = memoryStore();
  const week = 7 * DAY;
  const readings = Array.from({ length: 10_000 }, (_, index) => {
    const at = NOW - week + (index * week) / 10_000;
    const day = Math.floor((at - RESET) / DAY);
    const used = Math.min(LIMIT, ((at - (RESET + day * DAY)) / DAY) * 900);
    return sample(at, used, RESET + (day + 1) * DAY);
  });
  await seed(store, readings);
  const response = await get(mount(createHistory(store, { now: Date.now })));
  const body = historyResponseSchema.parse(await response.json());
  expect(body.samples.length).toBeLessThan(2000);
  const full = buildTimeline(readings);
  const thinned = buildTimeline([...body.samples, body.live].map(fromTuple));
  expect(thinned?.map((period) => period.startedAt)).toEqual(
    full?.map((period) => period.startedAt)
  );
});

test("a token without the usage scope is refused before the route runs", async () => {
  process.env.THAIPASS_TOKEN_KEY = generateTokenKey();
  stub([100]);
  const sealed = seal({
    clientId: "claude-code",
    cookie,
    expiresAt: Math.floor(NOW / 1000) + 3600,
    scope: "chat",
    subject: USER,
  });
  expect(sealed.ok).toBe(true);
  const token = sealed.ok ? sealed.token : "";
  const response = await get(app, `Bearer ${token}`);
  expect(response.status).toBe(403);
  expect(upstream.calls).toEqual([]);
});

test("a token with the usage scope reads its own history through the app", async () => {
  process.env.THAIPASS_TOKEN_KEY = generateTokenKey();
  stub([100]);
  restoreHistory = useHistory(createHistory(memoryStore(), { now: Date.now }));
  const sealed = seal({
    clientId: "claude-code",
    cookie,
    expiresAt: Math.floor(NOW / 1000) + 3600,
    scope: "chat usage",
    subject: USER,
  });
  const token = sealed.ok ? sealed.token : "";
  const response = await get(app, `Bearer ${token}`);
  expect(response.status).toBe(200);
  expect(historyResponseSchema.parse(await response.json()).store).toBe(
    "ready"
  );
});
