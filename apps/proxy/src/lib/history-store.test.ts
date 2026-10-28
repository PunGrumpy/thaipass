import { afterEach, expect, test } from "bun:test";

import type { SampleTuple } from "@thaipass/core/aipass/history";
import { stubUpstream } from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import {
  MAX_SAMPLES,
  memoryStore,
  RETENTION_DAYS,
  STORE_TIMEOUT_MS,
  upstashStore,
} from "./history-store";

const URL = "https://kv.test";
const TOKEN = "store-token";
const KEY = "tp:credits:v1:abc";
const AT = Date.parse("2026-09-03T20:00:00.000Z");
const RESET = Date.parse("2026-09-04T00:00:00.000Z");
const MS_PER_DAY = 86_400_000;

const tuple = (at: number, used: number): SampleTuple => [
  at,
  used,
  100,
  RESET,
  null,
  null,
  null,
];

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

interface Seen {
  authorization: string | null;
  commands: unknown[][];
}

interface Entry {
  readonly error?: string;
  readonly result?: number | readonly string[];
}

type Answer = Entry | readonly Entry[];

const kvFixture =
  (answer: Answer, seen: Seen[] = [], status = 200) =>
  (path: string, init?: RequestInit): Response | undefined => {
    if (!path.startsWith(URL)) {
      return undefined;
    }
    const headers = new Headers(init?.headers);
    seen.push({
      authorization: headers.get("authorization"),
      commands: z
        .array(z.array(z.unknown()))
        .parse(JSON.parse(String(init?.body))),
    });
    return Response.json(answer, { status });
  };

test("append is one authenticated pipeline that adds the member and trims", async () => {
  const seen: Seen[] = [];
  upstream = stubUpstream(
    () => new Response(""),
    kvFixture(
      [{ result: 1 }, { result: 0 }, { result: 0 }, { result: 1 }],
      seen
    )
  );
  await upstashStore({ token: TOKEN, url: URL }).append(KEY, tuple(AT, 12));
  expect(seen).toHaveLength(1);
  expect(upstream.calls).toEqual([`${URL}/pipeline`]);
  expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  expect(seen[0]?.commands).toEqual([
    ["ZADD", KEY, AT, JSON.stringify(tuple(AT, 12))],
    ["ZREMRANGEBYSCORE", KEY, "-inf", AT - RETENTION_DAYS * MS_PER_DAY],
    ["ZREMRANGEBYRANK", KEY, 0, -(MAX_SAMPLES + 1)],
    ["EXPIRE", KEY, RETENTION_DAYS * 86_400],
  ]);
});

test("read asks for the score range and decodes the members", async () => {
  const seen: Seen[] = [];
  const members = [
    JSON.stringify(tuple(AT, 1)),
    JSON.stringify(tuple(AT + 1, 2)),
  ];
  upstream = stubUpstream(
    () => new Response(""),
    kvFixture([{ result: members }], seen)
  );
  const samples = await upstashStore({ token: TOKEN, url: URL }).read(
    KEY,
    AT - 5,
    AT + 5
  );
  expect(seen[0]?.commands).toEqual([
    ["ZRANGE", KEY, AT - 5, AT + 5, "BYSCORE"],
  ]);
  expect(samples).toEqual([tuple(AT, 1), tuple(AT + 1, 2)]);
});

test("read skips a member that does not decode and keeps the rest", async () => {
  const members = [
    "not json",
    JSON.stringify(["x", 1]),
    JSON.stringify(tuple(AT, 3)),
  ];
  upstream = stubUpstream(
    () => new Response(""),
    kvFixture([{ result: members }])
  );
  const samples = await upstashStore({ token: TOKEN, url: URL }).read(
    KEY,
    0,
    AT
  );
  expect(samples).toEqual([tuple(AT, 3)]);
});

test("a command error in the pipeline throws", async () => {
  upstream = stubUpstream(
    () => new Response(""),
    kvFixture([{ result: 1 }, { error: "ERR wrong type" }])
  );
  await expect(
    upstashStore({ token: TOKEN, url: URL }).append(KEY, tuple(AT, 1))
  ).rejects.toThrow("ERR wrong type");
});

test("a non-2xx answer throws and names the status", async () => {
  upstream = stubUpstream(
    () => new Response(""),
    kvFixture({ error: "boom" }, [], 500)
  );
  await expect(
    upstashStore({ token: TOKEN, url: URL }).read(KEY, 0, AT)
  ).rejects.toThrow("500");
});

const hang = (_input: string | URL | Request, init?: RequestInit) => {
  const { promise, reject } = Promise.withResolvers<Response>();
  init?.signal?.addEventListener("abort", () => {
    reject(new Error("aborted"));
  });
  return promise;
};

test("a store that never answers is given up on after the timeout", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(hang, { preconnect: realFetch.preconnect });
  upstream = {
    bodyOf: () => {
      throw new Error("unused");
    },
    calls: [],
    deleted: () => Promise.resolve(false),
    restore: () => {
      globalThis.fetch = realFetch;
    },
    sent: [],
  };
  const started = Date.now();
  await expect(
    upstashStore({ token: TOKEN, url: URL }).read(KEY, 0, AT)
  ).rejects.toThrow();
  expect(Date.now() - started).toBeLessThan(STORE_TIMEOUT_MS * 2);
});

test("the memory store keeps one member per sample, in range, ascending", async () => {
  const store = memoryStore();
  await store.append(KEY, tuple(AT + 2, 3));
  await store.append(KEY, tuple(AT, 1));
  await store.append(KEY, tuple(AT, 1));
  await store.append("other", tuple(AT, 9));
  expect(await store.read(KEY, AT, AT + 5)).toEqual([
    tuple(AT, 1),
    tuple(AT + 2, 3),
  ]);
  expect(await store.read(KEY, AT + 1, AT + 5)).toEqual([tuple(AT + 2, 3)]);
  expect(Object.keys(store.dump()).toSorted()).toEqual(
    [KEY, "other"].toSorted()
  );
});
