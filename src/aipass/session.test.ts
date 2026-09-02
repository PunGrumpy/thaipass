import { expect, test } from "bun:test";

import { clientIdFromCookie, cookieFromRequest } from "./session";

const SESSION_COOKIE =
  "app_lang=th; __Secure-ai_passport_auth.session_token=abc.def";

const requestWith = (headers: Record<string, string>): Request =>
  new Request("https://proxy.test/v1/chat/completions", { headers });

test("returns null when the authorization header is missing", () => {
  expect(cookieFromRequest(requestWith({}))).toBeNull();
});

test("returns null for a non-bearer scheme", () => {
  const request = requestWith({ authorization: `Basic ${SESSION_COOKIE}` });
  expect(cookieFromRequest(request)).toBeNull();
});

test("returns null when the bearer value carries no session token", () => {
  const request = requestWith({ authorization: "Bearer app_lang=th" });
  expect(cookieFromRequest(request)).toBeNull();
});

test("accepts a lowercase bearer scheme", () => {
  const request = requestWith({ authorization: `bearer ${SESSION_COOKIE}` });
  expect(cookieFromRequest(request)).toBe(SESSION_COOKIE);
});

test("keeps the spaces inside a multi-part cookie", () => {
  const request = requestWith({ authorization: `Bearer ${SESSION_COOKIE}` });
  expect(cookieFromRequest(request)).toBe(SESSION_COOKIE);
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
