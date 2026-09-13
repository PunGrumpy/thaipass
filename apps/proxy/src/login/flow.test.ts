import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { challengeFor } from "@thaipass/core/auth/seal";

import {
  accountLabel,
  authorizeUrl,
  createPkce,
  createState,
  credentialsPath,
  describeExpiry,
  forgetLogin,
  loginFrom,
  readCallback,
  readLogin,
  saveLogin,
} from "./flow";

const ACCOUNT = {
  email: "reader@example.com",
  id: "user_42",
  name: "A Reader",
  organization: "TH-AI Passport",
};

const HOUR_S = 3600;
const DAY_S = 24 * HOUR_S;

const storePath = path.join(
  tmpdir(),
  `thaipass-login-${Bun.randomUUIDv7()}.json`
);

afterEach(async () => {
  await rm(storePath, { force: true });
});

test("the verifier never leaves, only its challenge", () => {
  const pkce = createPkce();
  expect(pkce.verifier.length).toBeGreaterThan(42);
  expect(pkce.challenge).toBe(challengeFor(pkce.verifier));
  expect(pkce.challenge).not.toBe(pkce.verifier);
});

test("the consent link carries everything the exchange will check", () => {
  const link = authorizeUrl({
    challenge: "challenge-value",
    clientId: "thaipass-cli",
    redirectUri: "http://127.0.0.1:7654/callback",
    scope: "chat models",
    state: "state-value",
    webUrl: "https://thaipass.vercel.app",
  });
  const url = new URL(link);

  // No locale: the site's middleware adds the reader's own and keeps the query.
  expect(url.pathname).toBe("/authorize");
  expect(url.searchParams.get("client_id")).toBe("thaipass-cli");
  expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:7654/callback"
  );
  expect(url.searchParams.get("scope")).toBe("chat models");
  expect(url.searchParams.get("state")).toBe("state-value");
});

test("a reply with the wrong state is refused", () => {
  const outcome = readCallback(
    "http://127.0.0.1:7654/callback?code=abc&state=elsewhere",
    "mine"
  );
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.reason).toContain("state");
  }
});

test("a cancelled login says so plainly", () => {
  const outcome = readCallback(
    "http://127.0.0.1:7654/callback?error=access_denied&state=mine",
    "mine"
  );
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.reason).toBe("the login was cancelled");
  }
});

test("a good reply yields the code", () => {
  const outcome = readCallback(
    "http://127.0.0.1:7654/callback?code=tp_c1_abc&state=mine",
    "mine"
  );
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    expect(outcome.code).toBe("tp_c1_abc");
  }
});

test("the login is stored for this user alone, and read back", async () => {
  const login = loginFrom(
    {
      access_token: "tp_v1_token",
      account: ACCOUNT,
      expires_in: DAY_S,
      scope: "chat models usage",
    },
    "https://gateway.example"
  );
  await saveLogin(login, storePath);

  const file = Bun.file(storePath);
  expect(await file.exists()).toBe(true);

  const read = await readLogin(storePath);
  expect(read?.token).toBe("tp_v1_token");
  expect(read?.account.id).toBe("user_42");
  expect(read?.proxyUrl).toBe("https://gateway.example");
});

test("a missing or unreadable store reads as no login", async () => {
  expect(await readLogin(storePath)).toBeNull();
  await Bun.write(storePath, "not json");
  expect(await readLogin(storePath)).toBeNull();
});

test("logging out forgets the file", async () => {
  await Bun.write(storePath, "{}");
  expect(await forgetLogin(storePath)).toBe(true);
  expect(await forgetLogin(storePath)).toBe(false);
});

test("the credentials path follows XDG when it is set", () => {
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = "/tmp/config-home";
  expect(credentialsPath()).toBe("/tmp/config-home/thaipass/credentials.json");
  process.env.XDG_CONFIG_HOME = previous ?? "";
});

test("expiry is described the way a person would say it", () => {
  const now = Math.floor(Date.now() / 1000);
  expect(describeExpiry(now - 1)).toBe("expired");
  expect(describeExpiry(now + 5 * HOUR_S)).toContain("5 hours");
  expect(describeExpiry(now + 2 * DAY_S)).toContain("2 days");
  expect(describeExpiry(now + DAY_S)).toBe("about a day left");
});

test("an account is named by whatever it actually has", () => {
  expect(accountLabel(ACCOUNT)).toBe("A Reader");
  expect(accountLabel({ ...ACCOUNT, name: null })).toBe("reader@example.com");
  expect(accountLabel({ ...ACCOUNT, email: null, name: null })).toBe("user_42");
});

test("state is long enough to be worth checking", () => {
  expect(createState().length).toBeGreaterThan(16);
  expect(createState()).not.toBe(createState());
});
