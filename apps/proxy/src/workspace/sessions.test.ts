import { afterEach, beforeEach, expect, test } from "bun:test";

import type { StreamEvent } from "@thaipass/core/aipass/stream";
import { sseResponse, stubUpstream } from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";

import { WorkspaceAuthError } from "./assist";
import { clearSessions, openAssist, stubSignIn } from "./sessions";
import type { WorkspaceSession } from "./sso";
import { argonReply, workspaceStub } from "./testing";
import type { WorkspaceStubOptions } from "./testing";

const ENDPOINT = "wss://browser.test";

let upstream: Upstream;
let restoreSignIn: () => void;
let signIns: string[];

/** Each sign-in hands back a session named after the order it happened in. */
const signInFake =
  (failures = 0) =>
  (token: string): Promise<WorkspaceSession> => {
    signIns.push(token);
    if (signIns.length <= failures) {
      return Promise.reject(new Error("browser unreachable"));
    }
    return Promise.resolve({
      cookie: `NID=${signIns.length}`,
      csesidx: String(signIns.length),
    });
  };

const workspace = async (options: Partial<WorkspaceStubOptions> = {}) => {
  const stub = workspaceStub({ reply: await argonReply(), ...options });
  upstream = stubUpstream(sseResponse([]), stub.respond);
  return stub;
};

const ask = async (token: string): Promise<StreamEvent[]> => {
  const events = await openAssist({
    endpoint: ENDPOINT,
    model: "gemini-4-argon",
    prompt: "hi",
    sessionToken: token,
    signal: undefined,
  });
  const all: StreamEvent[] = [];
  for await (const event of events) {
    all.push(event);
  }
  return all;
};

beforeEach(() => {
  clearSessions();
  signIns = [];
  restoreSignIn = stubSignIn(signInFake());
});

afterEach(() => {
  restoreSignIn();
  upstream.restore();
});

test("signs in once for a token and reuses the session after", async () => {
  await workspace();
  await ask("token-a");
  await ask("token-a");
  expect(signIns).toEqual(["token-a"]);
  await ask("token-b");
  expect(signIns).toEqual(["token-a", "token-b"]);
});

test("shares one sign-in between calls that arrive together", async () => {
  await workspace();
  await Promise.all([ask("token-c"), ask("token-c")]);
  expect(signIns).toEqual(["token-c"]);
});

test("replaces a cached session the workspace refuses, once", async () => {
  // Call one is fine, call two finds the session expired, the retry is fine.
  const stub = await workspace({ oxsrf: [200, 401, 200] });
  await ask("token-d");
  const events = await ask("token-d");
  expect(events.some((event) => event.kind === "finish")).toBe(true);
  expect(signIns).toEqual(["token-d", "token-d"]);
  expect(stub.seen.oxsrf).toBe(3);
});

test("does not sign in again when a session it just made is refused", async () => {
  await workspace({ oxsrf: [401, 401] });
  await expect(ask("token-e")).rejects.toBeInstanceOf(WorkspaceAuthError);
  expect(signIns).toEqual(["token-e"]);
});

test("gives up after the one retry", async () => {
  await workspace({ oxsrf: [200, 401, 401] });
  await ask("token-f");
  await expect(ask("token-f")).rejects.toBeInstanceOf(WorkspaceAuthError);
  expect(signIns).toEqual(["token-f", "token-f"]);
});

test("does not keep a sign-in that failed", async () => {
  await workspace();
  restoreSignIn();
  restoreSignIn = stubSignIn(signInFake(1));
  await expect(ask("token-g")).rejects.toThrow("browser unreachable");
  await ask("token-g");
  expect(signIns).toEqual(["token-g", "token-g"]);
});
