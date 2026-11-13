import { createHash } from "node:crypto";

import type { StreamEvent } from "@thaipass/core/aipass/stream";

import { streamAssist, WorkspaceAuthError } from "./assist";
import { signIn } from "./sso";
import type { WorkspaceSession } from "./sso";

/** Google's own session outlives this, and a sign-in costs a browser for ~5s. */
const TTL_MS = 50 * 60 * 1000;
const MAX_SESSIONS = 50;
const SIGN_IN_TIMEOUT_MS = 60_000;

interface Entry {
  readonly expiresAt: number;
  /** The promise, so callers arriving during a sign-in wait on it rather than start another. */
  readonly session: Promise<WorkspaceSession>;
}

/** Per warm instance only: a cold start signs in again. */
const cache = new Map<string, Entry>();

let signInWith: typeof signIn = signIn;

/** For tests: swaps the browser sign-in, and returns the way back. */
export const stubSignIn = (stub: typeof signIn): (() => void) => {
  signInWith = stub;
  return () => {
    signInWith = signIn;
  };
};

export const clearSessions = (): void => {
  cache.clear();
};

const keyOf = (sessionToken: string): string =>
  createHash("sha256").update(sessionToken).digest("hex");

const evict = (key: string, entry: Entry): void => {
  // A newer sign-in may already have replaced this one.
  if (cache.get(key) === entry) {
    cache.delete(key);
  }
};

const remember = (key: string, entry: Entry): void => {
  cache.delete(key);
  cache.set(key, entry);
  for (const oldest of cache.keys()) {
    if (cache.size <= MAX_SESSIONS) {
      break;
    }
    cache.delete(oldest);
  }
};

interface SessionRequest {
  readonly endpoint: string;
  readonly sessionToken: string;
}

interface Found {
  readonly entry: Entry;
  readonly key: string;
  /** Whether an earlier call signed it in, so it may have simply expired. */
  readonly reused: boolean;
}

const sessionFor = (request: SessionRequest): Found => {
  const key = keyOf(request.sessionToken);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { entry: cached, key, reused: true };
  }
  const entry: Entry = {
    expiresAt: Date.now() + TTL_MS,
    // Shared by every caller waiting on it, so one caller leaving must not abort it.
    session: signInWith(
      request.sessionToken,
      request.endpoint,
      AbortSignal.timeout(SIGN_IN_TIMEOUT_MS)
    ),
  };
  remember(key, entry);
  return { entry, key, reused: false };
};

export interface OpenAssist extends SessionRequest {
  readonly model: string;
  readonly prompt: string;
  readonly signal: AbortSignal | undefined;
}

/**
 * Asks the workspace on a cached session, or signs in first. A cached session
 * it refuses is replaced once, since it may simply have expired. A refusal of
 * one just signed in means the account itself is not let in, and says so.
 */
export const openAssist = async (
  options: OpenAssist
): Promise<AsyncIterable<StreamEvent>> => {
  const { model, prompt, signal } = options;
  let reused = false;
  const attempt = async (): Promise<AsyncIterable<StreamEvent>> => {
    const found = sessionFor(options);
    ({ reused } = found);
    let session: WorkspaceSession;
    try {
      session = await found.entry.session;
    } catch (error) {
      // A failed sign-in is not worth keeping for the next caller.
      evict(found.key, found.entry);
      throw error;
    }
    try {
      return await streamAssist({ model, prompt, session, signal });
    } catch (error) {
      if (error instanceof WorkspaceAuthError) {
        evict(found.key, found.entry);
      }
      throw error;
    }
  };
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof WorkspaceAuthError && reused) {
      return await attempt();
    }
    throw error;
  }
};
