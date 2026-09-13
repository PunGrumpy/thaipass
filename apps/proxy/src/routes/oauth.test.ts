import { afterEach, beforeEach, expect, test } from "bun:test";

import { generateTokenKey } from "@thaipass/core/auth/seal";
import { stubUpstream } from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import { app } from "../app";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const CLIENT = "claude-code";
const REDIRECT = "http://127.0.0.1:7654/callback";
const VERIFIER = "a".repeat(64);
/** S256 of the verifier above, as RFC 7636 computes it. */
const CHALLENGE = new Bun.CryptoHasher("sha256")
  .update(VERIFIER)
  .digest("base64url");

const TIER_PATH = "/lms/api/v1/session/session-tier";
const SESSION_PATH = "/lms/api/v1/session/";

let upstream: Upstream;
let previousKey: string | undefined;

const identityResponse = (path: string): Response | undefined => {
  if (path === TIER_PATH) {
    return Response.json({
      data: {
        member: { currentTierExp: 120, tierName: "Explorer" },
        user: {
          email: "reader@example.com",
          familyName: "Reader",
          givenName: "A",
          id: "user_42",
        },
      },
    });
  }
  if (path === SESSION_PATH) {
    return Response.json({
      data: {
        session: {
          member: { organizationName: "TH-AI Passport" },
          session: { expiresAt: "2099-01-01T00:00:00.000Z" },
          user: { role: "member" },
        },
      },
    });
  }
  return undefined;
};

beforeEach(() => {
  previousKey = process.env.THAIPASS_TOKEN_KEY;
  process.env.THAIPASS_TOKEN_KEY = generateTokenKey();
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    identityResponse
  );
});

afterEach(() => {
  upstream.restore();
  process.env.THAIPASS_TOKEN_KEY = previousKey ?? "";
});

const accountSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string().nullable(),
  organization: z.string().nullable(),
});

const codeSchema = z.object({ code: z.string(), scope: z.string() });

const tokenSchema = z.object({
  access_token: z.string(),
  account: accountSchema,
  expires_in: z.number(),
  scope: z.string(),
});

const userinfoSchema = z.object({
  account: accountSchema,
  client_id: z.string().nullable(),
});

const oauthErrorSchema = z.object({ error: z.string() });

const apiErrorSchema = z.object({ error: z.object({ message: z.string() }) });

const metadataSchema = z.object({
  authorization_endpoint: z.string(),
  scopes_supported: z.array(z.string()),
  token_endpoint: z.string(),
});

const read = async <T>(response: Response, schema: z.ZodType<T>): Promise<T> =>
  schema.parse(await response.json());

/** Every body these endpoints take is a flat set of string fields. */
type OAuthBody = Record<string, string | undefined>;

const post = (
  path: string,
  body: OAuthBody,
  headers: Record<string, string> = {}
) =>
  app.handle(
    new Request(`https://proxy.test${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
      method: "POST",
    })
  );

const asAccount = { authorization: `Bearer ${COOKIE}` };

const issueCode = async (scope?: string): Promise<string> => {
  const response = await post(
    "/oauth/code",
    {
      client_id: CLIENT,
      code_challenge: CHALLENGE,
      redirect_uri: REDIRECT,
      scope,
    },
    asAccount
  );
  const body = await read(response, codeSchema);
  return body.code;
};

const exchange = (code: string, verifier = VERIFIER) =>
  post("/oauth/token", {
    client_id: CLIENT,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT,
  });

test("a login ends with a token that reaches the account", async () => {
  const code = await issueCode();
  const response = await exchange(code);
  expect(response.status).toBe(200);

  const body = await read(response, tokenSchema);
  expect(body.access_token.startsWith("tp_v1_")).toBe(true);
  expect(body.access_token).not.toContain(COOKIE);
  expect(body.account.id).toBe("user_42");
  expect(body.account.organization).toBe("TH-AI Passport");
  expect(body.scope).toBe("chat models usage");
  expect(body.expires_in).toBeGreaterThan(0);

  const userinfo = await app.handle(
    new Request("https://proxy.test/oauth/userinfo", {
      headers: { authorization: `Bearer ${body.access_token}` },
    })
  );
  expect(userinfo.status).toBe(200);
  const who = await read(userinfo, userinfoSchema);
  expect(who.account.id).toBe("user_42");
  expect(who.client_id).toBe(CLIENT);
});

test("the code cannot be spent without the verifier it was issued for", async () => {
  const code = await issueCode();
  const response = await exchange(code, "b".repeat(64));
  expect(response.status).toBe(401);

  const body = await read(response, oauthErrorSchema);
  expect(body.error).toBe("invalid_grant");
});

test("the code cannot be spent by another app", async () => {
  const code = await issueCode();
  const response = await post("/oauth/token", {
    client_id: "someone-else",
    code,
    code_verifier: VERIFIER,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT,
  });
  expect(response.status).toBe(401);
});

test("the code cannot be redirected somewhere else", async () => {
  const code = await issueCode();
  const response = await post("/oauth/token", {
    client_id: CLIENT,
    code,
    code_verifier: VERIFIER,
    grant_type: "authorization_code",
    redirect_uri: "https://attacker.example/callback",
  });
  expect(response.status).toBe(401);
});

test("a code is not an access token", async () => {
  const code = await issueCode();
  const response = await app.handle(
    new Request("https://proxy.test/oauth/userinfo", {
      headers: { authorization: `Bearer ${code}` },
    })
  );
  expect(response.status).toBe(401);
});

test("a token cannot grant another app access", async () => {
  const code = await issueCode();
  const granted = await read(await exchange(code), tokenSchema);

  const response = await post(
    "/oauth/code",
    {
      client_id: "second-app",
      code_challenge: CHALLENGE,
      redirect_uri: REDIRECT,
    },
    { authorization: `Bearer ${granted.access_token}` }
  );
  expect(response.status).toBe(401);
});

test("a redirect off the web and off loopback is refused", async () => {
  const response = await post(
    "/oauth/code",
    {
      client_id: CLIENT,
      code_challenge: CHALLENGE,
      redirect_uri: "http://attacker.example/callback",
    },
    asAccount
  );
  expect(response.status).toBe(400);
});

test("a token is held to the scopes it was granted", async () => {
  const code = await issueCode("chat");
  const granted = await read(await exchange(code), tokenSchema);
  expect(granted.scope).toBe("chat");

  const denied = await app.handle(
    new Request("https://proxy.test/v1/usage", {
      headers: { authorization: `Bearer ${granted.access_token}` },
    })
  );
  expect(denied.status).toBe(403);
  const body = await read(denied, apiErrorSchema);
  expect(body.error.message).toContain("usage scope");
});

test("the cookie itself stays unscoped", async () => {
  const response = await app.handle(
    new Request("https://proxy.test/v1/usage", { headers: asAccount })
  );
  expect(response.status).not.toBe(403);
});

test("a deployment without a key issues nothing", async () => {
  process.env.THAIPASS_TOKEN_KEY = "";
  const response = await post(
    "/oauth/code",
    { client_id: CLIENT, code_challenge: CHALLENGE, redirect_uri: REDIRECT },
    asAccount
  );
  expect(response.status).toBe(501);
});

test("metadata points an app at the consent screen and the token endpoint", async () => {
  const response = await app.handle(
    new Request("https://proxy.test/oauth/metadata")
  );
  const body = await read(response, metadataSchema);
  expect(body.token_endpoint).toBe("https://proxy.test/oauth/token");
  expect(body.authorization_endpoint).toContain("/authorize");
  expect(body.scopes_supported).toContain("lms");
});
