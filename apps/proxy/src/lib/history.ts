import { createHash } from "node:crypto";

import { sampleFromCredits, toTuple } from "@thaipass/core/aipass/history";
import type {
  SampleTuple,
  SpendTag,
  StoreStatus,
} from "@thaipass/core/aipass/history";
import type { Identity } from "@thaipass/core/aipass/identity";
import type { Credits } from "@thaipass/core/aipass/quotas";
import { log } from "evlog";

import { storeFromEnv } from "./history-store";
import type { HistoryStore } from "./history-store";

/**
 * The proxy's whole credit-history surface: record what a request already
 * learned, and read a series back. Policy lives here (who owns a series, what
 * a failure means, when to skip a write); mechanics live in history-store.
 *
 * Invariants this module keeps, by construction:
 * - It never sees a cookie or a token. Callers hand it an `Identity`, or a
 *   thunk that resolves one, and the only things written are balances, a
 *   model and app name, and a hash of `userId`.
 * - It never throws into a request. History is a side effect of serving, so a
 *   store outage must not fail a turn. Every store call is bounded by
 *   STORE_TIMEOUT_MS, and a failure is one `log.warn`.
 * - Writes are idempotent: the sorted-set member is the sample itself.
 *
 * `record` returns a promise the caller awaits before it closes its response.
 * `waitUntil` would let the response go first, but Vercel documents it for
 * the Node.js and Edge runtimes and not for Bun, which this proxy runs on, so
 * the write is awaited instead, as `log.emit()` already is for a stream.
 */

const KEY_PREFIX = "tp:credits:v1:";
const KEY_LENGTH = 32;
/** Accounts whose last write this instance remembers, so a long-lived one cannot grow without bound. */
const MAX_TRACKED_ACCOUNTS = 500;

/** Branded so a clientId or a raw userId cannot be passed where the hashed key goes. */
export type AccountKey = string & { readonly __brand: "AccountKey" };

/**
 * Keyed on the AI Pass user id, never on `clientId`, so a rotated session or
 * the LMS cookie of the same account lands in one series. Hashed so the id
 * itself never reaches the store.
 */
export const accountKey = (identity: Pick<Identity, "userId">): AccountKey => {
  const hash = createHash("sha256")
    .update(identity.userId)
    .digest("hex")
    .slice(0, KEY_LENGTH);
  // SAFETY: this is the one place a key is made, which is what the brand claims.
  return `${KEY_PREFIX}${hash}` as AccountKey;
};

export interface Reading {
  readonly credits: Credits;
  /** Set when the reading closed a completion: what that call spent. */
  readonly spend?: SpendTag;
}

export interface TimeRange {
  readonly from: number;
  readonly to: number;
}

export interface Stored {
  readonly store: StoreStatus;
  /** Ascending. Empty when `store` is not "ready". */
  readonly samples: SampleTuple[];
}

export interface History {
  /** False when no store is configured. A route skips the identity read it would only need for this. */
  readonly enabled: boolean;
  /**
   * Resolves after the write settles, and never rejects. `who` is a thunk so a
   * disabled history makes no identity read. A balance identical to the last
   * one this instance wrote for the account is skipped; a cold instance writes
   * a duplicate and the timeline collapses it.
   */
  readonly record: (
    who: () => Identity | Promise<Identity | null> | null,
    reading: Reading
  ) => Promise<void>;
  /** "off" with no store, "down" when it did not answer, never an error. */
  readonly read: (identity: Identity, range: TimeRange) => Promise<Stored>;
}

export interface HistoryDeps {
  readonly now: () => number;
}

const unchanged = (credits: Credits): string =>
  `${credits.creditsUsed}|${credits.creditsLimit}|${credits.creditsResetAt}`;

/** `null` store gives a disabled history whose `record` does nothing and whose `read` says off. */
export const createHistory = (
  store: HistoryStore | null,
  deps: HistoryDeps
): History => {
  const lastWritten = new Map<AccountKey, string>();
  const isRepeat = (key: AccountKey, credits: Credits): boolean =>
    lastWritten.get(key) === unchanged(credits);
  const markWritten = (key: AccountKey, credits: Credits): void => {
    if (lastWritten.size >= MAX_TRACKED_ACCOUNTS) {
      lastWritten.clear();
    }
    lastWritten.set(key, unchanged(credits));
  };

  return {
    enabled: store !== null,
    read: async (identity, range) => {
      if (!store) {
        return { samples: [], store: "off" };
      }
      try {
        const samples = await store.read(
          accountKey(identity),
          range.from,
          range.to
        );
        return { samples, store: "ready" };
      } catch (error) {
        log.warn({ historyError: String(error), msg: "history read failed" });
        return { samples: [], store: "down" };
      }
    },
    record: async (who, reading) => {
      if (!store) {
        return;
      }
      try {
        const sample = sampleFromCredits(
          reading.credits,
          deps.now(),
          reading.spend ?? null
        );
        const identity = sample ? await who() : null;
        if (!(sample && identity)) {
          return;
        }
        const key = accountKey(identity);
        if (!reading.spend && isRepeat(key, reading.credits)) {
          return;
        }
        await store.append(key, toTuple(sample));
        markWritten(key, reading.credits);
      } catch (error) {
        log.warn({ historyError: String(error), msg: "history write failed" });
      }
    },
  };
};

let active: History = createHistory(storeFromEnv(), { now: Date.now });

/**
 * What routes and turns import. It forwards to one implementation so a test can
 * hand in a `memoryStore()` through `useHistory` instead of the environment.
 */
export const history: History = {
  get enabled() {
    return active.enabled;
  },
  read: (identity, range) => active.read(identity, range),
  record: (who, reading) => active.record(who, reading),
};

/** Test seam: swaps the implementation and returns the call that puts it back. */
export const useHistory = (next: History): (() => void) => {
  const previous = active;
  active = next;
  return () => {
    active = previous;
  };
};
