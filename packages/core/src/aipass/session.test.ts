import { afterEach, beforeEach, expect, test } from "bun:test";

import { generateTokenKey, seal } from "../auth/seal";
import { clientIdFromCookie, cookieFromRequest } from "./session";

const SESSION_COOKIE =
  "app_lang=th; __Secure-ai_passport_auth.session_token=abc.def";

const requestWith = (headers: Record<string, string>): Request =>
  new Request("https://proxy.test/v1/chat/completions", { headers });

const lookup = (headers: Record<string, string> = {}) =>
  cookieFromRequest(requestWith(headers));

test("names the missing header when there is no authorization", () => {
  const result = lookup();
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("missing Authorization");
});

test("names the scheme when it is not bearer", () => {
  const result = lookup({ authorization: `Basic ${SESSION_COOKIE}` });
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("Bearer scheme");
});

test("says to send the whole cookie header when only the token arrives", () => {
  const result = lookup({ authorization: "Bearer jMgaPqgp9D0H9FErUXCpPpMf" });
  expect(result.ok).toBe(false);
  const reason = result.ok ? "" : result.reason;
  expect(reason).toContain("__Secure-ai_passport_auth.session_token");
  expect(reason).toContain("whole Cookie header");
});

test("never echoes what the caller sent back at them", () => {
  const secret = "jMgaPqgp9D0H9FErUXCpPpMf";
  const result = lookup({ authorization: `Bearer ${secret}` });
  expect(result.ok ? "" : result.reason).not.toContain(secret);
});

test("accepts a lowercase bearer scheme", () => {
  const result = lookup({ authorization: `bearer ${SESSION_COOKIE}` });
  expect(result.ok && result.cookie).toBe(SESSION_COOKIE);
});

test("keeps the spaces inside a multi-part cookie", () => {
  const result = lookup({ authorization: `Bearer ${SESSION_COOKIE}` });
  expect(result.ok && result.cookie).toBe(SESSION_COOKIE);
});

test("accepts the session token on its own without other cookies", () => {
  const bare = "__Secure-ai_passport_auth.session_token=abc.def";
  const result = lookup({ authorization: `Bearer ${bare}` });
  expect(result.ok && result.cookie).toBe(bare);
});

test("derives a stable 16 character hex client id", () => {
  const id = clientIdFromCookie(SESSION_COOKIE);
  expect(id).toBe(clientIdFromCookie(SESSION_COOKIE));
  expect(id).toMatch(/^[0-9a-f]{16}$/u);
});

test("derives different client ids for different cookies", () => {
  expect(clientIdFromCookie(SESSION_COOKIE)).not.toBe(
    clientIdFromCookie(`${SESSION_COOKIE}x`)
  );
});

const AN_HOUR_ON = (): number => Math.floor(Date.now() / 1000) + 3600;

let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.THAIPASS_TOKEN_KEY;
  process.env.THAIPASS_TOKEN_KEY = generateTokenKey();
});

afterEach(() => {
  process.env.THAIPASS_TOKEN_KEY = previousKey ?? "";
});

const tokenFor = (scope?: string): string => {
  const sealed = seal({
    clientId: "claude-code",
    cookie: SESSION_COOKIE,
    expiresAt: AN_HOUR_ON(),
    scope,
  });
  if (!sealed.ok) {
    throw new Error(sealed.reason);
  }
  return sealed.token;
};

test("takes a thaipass token where a cookie would go", () => {
  const result = lookup({ authorization: `Bearer ${tokenFor("chat")}` });
  expect(result.ok && result.cookie).toBe(SESSION_COOKIE);
  expect(result.ok && result.grant?.clientId).toBe("claude-code");
  expect(result.ok && result.grant?.scope).toBe("chat");
});

test("takes one from an Anthropic client's x-api-key too", () => {
  const result = lookup({ "x-api-key": tokenFor() });
  expect(result.ok && result.cookie).toBe(SESSION_COOKIE);
});

test("leaves a raw cookie unscoped", () => {
  const result = lookup({ authorization: `Bearer ${SESSION_COOKIE}` });
  expect(result.ok && result.grant).toBeUndefined();
});

test("refuses a token this deployment cannot open", () => {
  const token = tokenFor();
  process.env.THAIPASS_TOKEN_KEY = generateTokenKey();

  const result = lookup({ authorization: `Bearer ${token}` });
  expect(result.ok).toBe(false);
  expect(!result.ok && result.reason).toContain("another deployment");
});
