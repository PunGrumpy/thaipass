import { afterEach, beforeEach, expect, test } from "bun:test";

import { generateTokenKey, seal } from "@thaipass/core/auth/seal";

import { resolveCredential } from "./credential";

const COOKIE =
  "app_lang=th; __Secure-ai_passport_auth.session_token=abc.def; other=1";

const AN_HOUR = 3600;

let previousKey: string | undefined;

const tokenFor = (): string => {
  const sealed = seal({
    cookie: COOKIE,
    expiresAt: Math.floor(Date.now() / 1000) + AN_HOUR,
  });
  if (!sealed.ok) {
    throw new Error(sealed.reason);
  }
  return sealed.token;
};

beforeEach(() => {
  previousKey = process.env.THAIPASS_TOKEN_KEY;
  process.env.THAIPASS_TOKEN_KEY = generateTokenKey();
});

afterEach(() => {
  process.env.THAIPASS_TOKEN_KEY = previousKey ?? "";
});

test("passes a Cookie header through as it arrived", () => {
  expect(resolveCredential(COOKIE)).toBe(COOKIE);
});

test("opens a thaipass token when this process holds the key", () => {
  expect(resolveCredential(tokenFor())).toBe(COOKIE);
});

test("says what a token needs when this process holds no key", () => {
  const token = tokenFor();
  process.env.THAIPASS_TOKEN_KEY = "";

  expect(() => resolveCredential(token)).toThrow(/THAIPASS_TOKEN_KEY/u);
});

test("refuses a credential carrying no session token", () => {
  expect(() => resolveCredential("app_lang=th")).toThrow(
    /__Secure-ai_passport_auth\.session_token/u
  );
});
