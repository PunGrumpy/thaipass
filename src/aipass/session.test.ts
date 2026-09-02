import { expect, test } from "bun:test";

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
