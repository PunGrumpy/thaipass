import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  challengeFor,
  challengeMatches,
  generateTokenKey,
  isSealed,
  issuesTokens,
  seal,
  unseal,
} from "./seal";

const COOKIE =
  "app_lang=th; __Secure-ai_passport_auth.session_token=eyJhbGciOiJkaXIifQ..abc; other=1";

const inAnHour = (): number => Math.floor(Date.now() / 1000) + 3600;

const sealedToken = (): string => {
  const result = seal({ cookie: COOKIE, expiresAt: inAnHour() });
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.token;
};

let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.THAIPASS_TOKEN_KEY;
  process.env.THAIPASS_TOKEN_KEY = generateTokenKey();
});

afterEach(() => {
  // An empty value reads as no key at all, which is the state a deployment
  // without THAIPASS_TOKEN_KEY is in.
  process.env.THAIPASS_TOKEN_KEY = previousKey ?? "";
});

describe("seal", () => {
  it("returns the cookie to whoever holds the key", () => {
    const token = sealedToken();
    expect(token.startsWith("tp_v1_")).toBe(true);
    expect(token).not.toContain(COOKIE);

    const opened = unseal(token);
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.claims.cookie).toBe(COOKIE);
    }
  });

  it("carries the app, the scope and the account", () => {
    const result = seal({
      clientId: "claude-code",
      cookie: COOKIE,
      expiresAt: inAnHour(),
      scope: "chat models",
      subject: "user_123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const opened = unseal(result.token);
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.claims.clientId).toBe("claude-code");
      expect(opened.claims.scope).toBe("chat models");
      expect(opened.claims.subject).toBe("user_123");
    }
  });

  it("refuses a token sealed by another deployment", () => {
    const token = sealedToken();
    process.env.THAIPASS_TOKEN_KEY = generateTokenKey();

    const opened = unseal(token);
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(opened.reason).toContain("another deployment");
    }
  });

  it("refuses a token whose bytes were altered", () => {
    const token = sealedToken();
    const flipped = `${token.slice(0, -2)}${token.endsWith("a") ? "b" : "a"}=`;

    expect(unseal(flipped).ok).toBe(false);
  });

  it("refuses an expired token", () => {
    const result = seal({
      cookie: COOKIE,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const opened = unseal(result.token);
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(opened.reason).toContain("expired");
    }
  });

  it("will not let a code pass as an access token", () => {
    const result = seal({ cookie: COOKIE, expiresAt: inAnHour() }, "code");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.token.startsWith("tp_c1_")).toBe(true);
    expect(unseal(result.token).ok).toBe(false);
    expect(unseal(result.token, "code").ok).toBe(true);
  });

  it("says so when the deployment issues no tokens", () => {
    process.env.THAIPASS_TOKEN_KEY = "";
    expect(issuesTokens()).toBe(false);

    const result = seal({ cookie: COOKIE, expiresAt: inAnHour() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("THAIPASS_TOKEN_KEY");
    }
  });

  it("treats a key of the wrong length as no key at all", () => {
    process.env.THAIPASS_TOKEN_KEY = Buffer.from("short").toString("base64");
    expect(issuesTokens()).toBe(false);
  });

  it("knows a thaipass token from a cookie", () => {
    expect(isSealed(sealedToken())).toBe(true);
    expect(isSealed(COOKIE)).toBe(false);
  });
});

describe("challengeMatches", () => {
  it("accepts the verifier its challenge was made from", () => {
    const verifier = "a-long-random-verifier-from-the-client";
    expect(challengeMatches(challengeFor(verifier), verifier)).toBe(true);
  });

  it("rejects any other verifier", () => {
    expect(challengeMatches(challengeFor("one"), "two")).toBe(false);
  });
});
