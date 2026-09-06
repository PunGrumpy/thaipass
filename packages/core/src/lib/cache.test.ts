import { expect, test } from "bun:test";

import { ttlCache } from "./cache";

const HOUR_MS = 60 * 60 * 1000;

test("returns undefined for a key it has never seen", () => {
  expect(ttlCache<string>(HOUR_MS).get("missing")).toBeUndefined();
});

test("returns a value stored under its key", () => {
  const cache = ttlCache<string>(HOUR_MS);
  cache.set("a", "one");
  cache.set("b", "two");
  expect(cache.get("a")).toBe("one");
  expect(cache.get("b")).toBe("two");
});

test("replaces a value written twice under one key", () => {
  const cache = ttlCache<string>(HOUR_MS);
  cache.set("a", "one");
  cache.set("a", "two");
  expect(cache.get("a")).toBe("two");
});

test("drops a value once its ttl has passed", async () => {
  const cache = ttlCache<string>(1);
  cache.set("a", "one");
  await Bun.sleep(5);
  expect(cache.get("a")).toBeUndefined();
});

test("evicts every expired key on a read, not just the one asked for", async () => {
  const cache = ttlCache<string>(1);
  cache.set("a", "one");
  cache.set("b", "two");
  await Bun.sleep(5);
  cache.get("unrelated");
  cache.set("c", "three");
  expect(cache.get("a")).toBeUndefined();
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("c")).toBe("three");
});
