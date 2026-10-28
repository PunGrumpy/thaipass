import { sampleTupleSchema } from "@thaipass/core/aipass/history";
import type { SampleTuple } from "@thaipass/core/aipass/history";
import { z } from "zod";

import { env } from "./env";

/**
 * Where samples live: a port with one adapter, Upstash Redis over its REST
 * API, and an in-memory fake for tests.
 *
 * Layout: one sorted set per account, score = sample time, member = the JSON
 * sample tuple. Each write adds an independent member, so two function
 * instances writing at once never read-modify-write the same value. The merge
 * is the sort at read.
 *
 * The REST API is a plain `fetch` with a bearer token, so a handful of
 * commands need no client dependency and the fixtures that already stub
 * `fetch` can fake it.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_DAY = 24 * 60 * 60;
export const RETENTION_DAYS = 14;
/**
 * Newest members kept per account. A page left open writes about one a minute
 * until the balance moves, so this keeps the whole retention for a heavy user
 * and bounds storage for any user.
 */
export const MAX_SAMPLES = 10_000;
/** Every store call gives up after this, so a slow store cannot hold a turn. */
export const STORE_TIMEOUT_MS = 2000;

export interface HistoryStore {
  /** Idempotent: the same tuple twice is one member. Also trims by age, count and TTL. */
  readonly append: (key: string, sample: SampleTuple) => Promise<void>;
  /** Members scored in `[from, to]`, ascending. A member that does not decode is skipped. */
  readonly read: (
    key: string,
    from: number,
    to: number
  ) => Promise<SampleTuple[]>;
}

export interface RedisRest {
  readonly url: string;
  readonly token: string;
}

type Command = readonly (number | string)[];

const pipelineEntry = z.object({
  error: z.string().optional(),
  result: z.unknown().optional(),
});

const membersSchema = z.array(z.string());

const decodeMember = (member: string): SampleTuple | null => {
  try {
    const parsed = sampleTupleSchema.safeParse(JSON.parse(member));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** One round trip. Throws on a non-2xx, a bad body, or any command's own error. */
const pipeline = async (
  rest: RedisRest,
  commands: readonly Command[]
): Promise<unknown[]> => {
  const response = await fetch(`${rest.url}/pipeline`, {
    body: JSON.stringify(commands),
    headers: {
      authorization: `Bearer ${rest.token}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`history store answered ${response.status}`);
  }
  const entries = z.array(pipelineEntry).parse(await response.json());
  const failed = entries.find((entry) => entry.error !== undefined);
  if (failed) {
    throw new Error(`history store command failed: ${failed.error}`);
  }
  return entries.map((entry) => entry.result);
};

/**
 * append: ZADD, then trim by age, by count, and refresh the TTL so an
 *         abandoned account vanishes.
 * read:   ZRANGE ... BYSCORE
 */
export const upstashStore = (rest: RedisRest): HistoryStore => ({
  append: async (key, sample) => {
    const [at] = sample;
    await pipeline(rest, [
      ["ZADD", key, at, JSON.stringify(sample)],
      ["ZREMRANGEBYSCORE", key, "-inf", at - RETENTION_DAYS * MS_PER_DAY],
      ["ZREMRANGEBYRANK", key, 0, -(MAX_SAMPLES + 1)],
      ["EXPIRE", key, RETENTION_DAYS * SECONDS_PER_DAY],
    ]);
  },
  read: async (key, from, to) => {
    const [members] = await pipeline(rest, [
      ["ZRANGE", key, from, to, "BYSCORE"],
    ]);
    const samples: SampleTuple[] = [];
    for (const member of membersSchema.parse(members)) {
      const sample = decodeMember(member);
      if (sample) {
        samples.push(sample);
      }
    }
    return samples;
  },
});

/**
 * Both env names are read here and nowhere else. Null unless URL and token
 * are both set, which means no store was provisioned.
 */
export const storeFromEnv = (): HistoryStore | null => {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!(url && token)) {
    return null;
  }
  return upstashStore({ token, url: url.replace(/\/+$/u, "") });
};

/** Test fake: the same contract over a Map, plus `dump()` to assert what was stored. */
export const memoryStore = (): HistoryStore & {
  readonly dump: () => Record<string, SampleTuple[]>;
} => {
  const sets = new Map<string, Map<string, SampleTuple>>();
  return {
    append: (key, sample) => {
      const members = sets.get(key) ?? new Map<string, SampleTuple>();
      members.set(JSON.stringify(sample), sample);
      sets.set(key, members);
      return Promise.resolve();
    },
    dump: () =>
      Object.fromEntries(
        [...sets].map(([key, members]) => [key, [...members.values()]])
      ),
    read: (key, from, to) =>
      Promise.resolve(
        [...(sets.get(key)?.values() ?? [])]
          .filter(([at]) => at >= from && at <= to)
          .toSorted((a, b) => a[0] - b[0])
      ),
  };
};
