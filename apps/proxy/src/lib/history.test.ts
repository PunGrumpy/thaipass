import { expect, test } from "bun:test";

import type { Identity } from "@thaipass/core/aipass/identity";
import type { Credits } from "@thaipass/core/aipass/quotas";

import { accountKey, createHistory } from "./history";
import { memoryStore } from "./history-store";
import type { HistoryStore } from "./history-store";

const NOW = Date.parse("2026-09-03T20:00:00.000Z");
const IDENTITY: Identity = {
  userEmail: "reader@example.com",
  userId: "user_1",
};

const credits = (used: number): Credits => ({
  creditsAvailable: 100 - used,
  creditsLimit: 100,
  creditsResetAt: "2026-09-04T00:00:00.000Z",
  creditsUsed: used,
});

const who = (identity: Identity | null = IDENTITY) => {
  const calls = { count: 0 };
  return {
    calls,
    resolve: () => {
      calls.count += 1;
      return Promise.resolve(identity);
    },
  };
};

const failing: HistoryStore = {
  append: () => Promise.reject(new Error("store is down")),
  read: () => Promise.reject(new Error("store is down")),
};

test("a history with no store never asks who the account is and reads as off", async () => {
  const history = createHistory(null, { now: () => NOW });
  const identity = who();
  await history.record(identity.resolve, { credits: credits(10) });
  expect(identity.calls.count).toBe(0);
  expect(history.enabled).toBe(false);
  expect(await history.read(IDENTITY, { from: 0, to: NOW })).toEqual({
    samples: [],
    store: "off",
  });
});

test("a record lands under a key hashed from the user id and nothing else", async () => {
  const store = memoryStore();
  const history = createHistory(store, { now: () => NOW });
  await history.record(who().resolve, { credits: credits(10) });
  const dump = store.dump();
  const [key] = Object.keys(dump);
  expect(key).toBe(accountKey(IDENTITY));
  expect(key).not.toContain("user_1");
  expect(dump[key ?? ""]).toEqual([
    [NOW, 10, 100, Date.parse("2026-09-04T00:00:00.000Z"), null, null, null],
  ]);
  expect(JSON.stringify(dump)).not.toContain("reader@example.com");
});

test("two identities with one user id share a series", () => {
  expect(accountKey({ userId: "user_1" })).toBe(
    accountKey({ userId: "user_1" })
  );
  expect(accountKey({ userId: "user_1" })).not.toBe(
    accountKey({ userId: "user_2" })
  );
});

test("a completion's spend rides on its sample", async () => {
  const store = memoryStore();
  const history = createHistory(store, { now: () => NOW });
  await history.record(who().resolve, {
    credits: credits(30),
    spend: { app: "codex", credits: 20, model: "gpt-5.5" },
  });
  const [samples] = Object.values(store.dump());
  expect(samples?.[0]?.slice(4)).toEqual(["gpt-5.5", "codex", 20]);
});

test("a balance identical to the last one written is skipped, a spend never is", async () => {
  const store = memoryStore();
  let now = NOW;
  const history = createHistory(store, { now: () => now });
  await history.record(who().resolve, { credits: credits(10) });
  now += 60_000;
  await history.record(who().resolve, { credits: credits(10) });
  now += 60_000;
  await history.record(who().resolve, {
    credits: credits(10),
    spend: { app: null, credits: 0, model: "gemini-3.5-flash-lite" },
  });
  now += 60_000;
  await history.record(who().resolve, { credits: credits(12) });
  const [samples] = Object.values(store.dump());
  expect(samples?.map(([at, used]) => [at - NOW, used])).toEqual([
    [0, 10],
    [120_000, 10],
    [180_000, 12],
  ]);
});

test("an account that cannot be identified writes nothing", async () => {
  const store = memoryStore();
  const history = createHistory(store, { now: () => NOW });
  await history.record(who(null).resolve, { credits: credits(10) });
  expect(store.dump()).toEqual({});
});

test("a credit balance with no readable reset time writes nothing", async () => {
  const store = memoryStore();
  const history = createHistory(store, { now: () => NOW });
  await history.record(who().resolve, {
    credits: { ...credits(10), creditsResetAt: "soon" },
  });
  expect(store.dump()).toEqual({});
});

test("a store that fails is swallowed on write and reads as down", async () => {
  const history = createHistory(failing, { now: () => NOW });
  await history.record(who().resolve, { credits: credits(10) });
  expect(await history.read(IDENTITY, { from: 0, to: NOW })).toEqual({
    samples: [],
    store: "down",
  });
});

test("an identity lookup that throws is swallowed too", async () => {
  const history = createHistory(memoryStore(), { now: () => NOW });
  await history.record(() => Promise.reject(new Error("upstream")), {
    credits: credits(10),
  });
  expect(history.enabled).toBe(true);
});

test("reading returns what was written, in range", async () => {
  const store = memoryStore();
  let now = NOW;
  const history = createHistory(store, { now: () => now });
  const write = async (used: number) => {
    await history.record(who().resolve, { credits: credits(used) });
    now += 60_000;
  };
  await write(10);
  await write(20);
  await write(30);
  const read = await history.read(IDENTITY, { from: NOW + 30_000, to: now });
  expect(read.store).toBe("ready");
  expect(read.samples.map(([, used]) => used)).toEqual([20, 30]);
});
