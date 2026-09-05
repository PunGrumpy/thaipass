import { expect, test } from "bun:test";

import type { CatalogEntry } from "./catalog";
import { levelForBudget, resolveThinking } from "./thinking";

const entry = (thinking: readonly string[] | null): CatalogEntry => ({
  free: false,
  ready: true,
  thinking,
});

test("asks for nothing when the caller named no level", () => {
  expect(resolveThinking(undefined, entry(["low"]))).toEqual({ level: null });
});

test("sends a level the model advertises", () => {
  expect(resolveThinking("max", entry(["low", "high", "max"]))).toEqual({
    level: "max",
  });
});

test("drops a level the model does not advertise and says which it does", () => {
  const resolved = resolveThinking("max", entry(["low", "medium"]));
  expect(resolved.level).toBeNull();
  expect(resolved.dropped).toContain("low, medium");
});

test("falls back to the common three when the catalog could not be read", () => {
  expect(resolveThinking("high")).toEqual({ level: "high" });
  expect(resolveThinking("max").level).toBeNull();
});

test("treats an empty advertised list as no list at all", () => {
  expect(resolveThinking("medium", entry([]))).toEqual({ level: "medium" });
});

test("turns an anthropic token budget into a level", () => {
  expect(levelForBudget(1024)).toBe("low");
  expect(levelForBudget(8192)).toBe("medium");
  expect(levelForBudget(32_000)).toBe("high");
});
