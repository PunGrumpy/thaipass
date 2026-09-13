import { fetchIdentity } from "@thaipass/core/aipass/identity";
import {
  clientIdFromCookie,
  cookieFromRequest,
} from "@thaipass/core/aipass/session";
import {
  challengeMatches,
  issuesTokens,
  seal,
  unseal,
} from "@thaipass/core/auth/seal";
import { Elysia, status } from "elysia";
import { z } from "zod";

import { env } from "../lib/env";
import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { DEFAULT_SCOPES, formatScopes, parseScopes } from "../lib/scopes";

/**
 * Login with thaipass: the endpoints an app uses instead of asking someone for
 * their AI Pass cookie.
 *
 * The flow is the one every CLI already knows — authorization code with PKCE —
 * with the consent screen on the dashboard rather than here, because the
 * dashboard is where the account holder's session lives. The dashboard calls
 * POST /oauth/code with its own cookie once the reader approves, hands the code
 * back to the app through its redirect, and the app exchanges it here.
 *
 * Nothing is written down between those two calls. The code is a sealed
 * envelope carrying the cookie, the app it was issued to, the redirect it was
 * issued for and the PKCE challenge, so the exchange can check all four without
 * a database behind it.
 */

const CODE_TTL_S = 120;
const MAX_TOKEN_TTL_S = 30 * 24 * 60 * 60;
const MIN_VERIFIER = 43;
const MAX_VERIFIER = 128;
const SECOND_MS = 1000;

const CHALLENGE_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/u;
const CLIENT_ID_REGEX = /^[a-z0-9][a-z0-9\-._]{1,63}$/iu;

export const oauthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string(),
});

/** OAuth errors keep the RFC 6749 shape, because that is what clients parse. */
const oauthError = (error: string, description: string) => ({
  error,
  error_description: description,
});

const NO_TOKENS =
  "this deployment issues no thaipass tokens: it was started without THAIPASS_TOKEN_KEY, so apps must send an AI Pass cookie";

export const codeRequestSchema = z.object({
  client_id: z.string().regex(CLIENT_ID_REGEX),
  code_challenge: z.string().regex(CHALLENGE_REGEX),
  code_challenge_method: z.literal("S256").optional(),
  redirect_uri: z.string().url(),
  scope: z.string().optional(),
});

export const codeResponseSchema = z.object({
  code: z.string(),
  expires_in: z.number(),
  scope: z.string(),
});

export const tokenRequestSchema = z.object({
  client_id: z.string().regex(CLIENT_ID_REGEX),
  code: z.string(),
  code_verifier: z.string().min(MIN_VERIFIER).max(MAX_VERIFIER),
  grant_type: z.literal("authorization_code"),
  redirect_uri: z.string().url(),
});

export const accountSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string().nullable(),
  organization: z.string().nullable(),
});

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  account: accountSchema,
  expires_in: z.number(),
  scope: z.string(),
  token_type: z.literal("Bearer"),
});

export const metadataSchema = z.object({
  authorization_endpoint: z.string(),
  code_challenge_methods_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()),
  issuer: z.string(),
  scopes_supported: z.array(z.string()),
  token_endpoint: z.string(),
  userinfo_endpoint: z.string(),
});

export const userinfoSchema = z.object({
  account: accountSchema,
  client_id: z.string().nullable(),
  expires_at: z.number().nullable(),
  scope: z.string(),
  session_expires_at: z.string().nullable(),
});

/**
 * A redirect has to be somewhere the person who approved can actually land:
 * an https site, or a loopback port, which is where a CLI listens.
 */
const redirectAllowed = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") {
    return true;
  }
  return (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]")
  );
};

const nowSeconds = (): number => Math.floor(Date.now() / SECOND_MS);

/**
 * A token outlives neither the AI Pass session inside it nor a month. The
 * session's own expiry is the honest ceiling: once upstream drops it, the
 * sealed cookie is worth nothing anyway.
 */
const tokenExpiry = (sessionExpiresAt: string | undefined): number => {
  const ceiling = nowSeconds() + MAX_TOKEN_TTL_S;
  if (sessionExpiresAt === undefined) {
    return ceiling;
  }
  const session = Math.floor(new Date(sessionExpiresAt).getTime() / SECOND_MS);
  return Number.isFinite(session) && session > nowSeconds()
    ? Math.min(session, ceiling)
    : ceiling;
};

const accountOf = (
  identity: Awaited<ReturnType<typeof fetchIdentity>>,
  fallbackId: string
) => ({
  email: identity?.userEmail ?? null,
  id: identity?.userId ?? fallbackId,
  name: identity?.userName ?? null,
  organization: identity?.orgName ?? null,
});

export const oauthRoutes = new Elysia()
  .use(requestLogger)
  .model({
    CodeRequest: codeRequestSchema,
    CodeResponse: codeResponseSchema,
    OAuthError: oauthErrorSchema,
    OAuthMetadata: metadataSchema,
    TokenRequest: tokenRequestSchema,
    TokenResponse: tokenResponseSchema,
    Userinfo: userinfoSchema,
  })
  .get(
    "/oauth/metadata",
    {
      detail: {
        description:
          "Where an app sends someone to approve a login, and where it exchanges the code afterwards. The authorization endpoint is a page on the dashboard, not on this gateway, because that is where the account holder's own session lives.",
        responses: { "200": json("OAuthMetadata", "The endpoints and scopes") },
        summary: "Read the login endpoints",
        tags: ["Login"],
      },
      response: { 200: "OAuthMetadata" },
    },
    ({ request }) => {
      const issuer = new URL(request.url).origin;
      return {
        authorization_endpoint: `${env.NEXT_PUBLIC_WEB_URL}/authorize`,
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code"],
        issuer,
        scopes_supported: [...DEFAULT_SCOPES, "media", "lms"],
        token_endpoint: `${issuer}/oauth/token`,
        userinfo_endpoint: `${issuer}/oauth/userinfo`,
      };
    }
  )
  .post(
    "/oauth/code",
    {
      body: "CodeRequest",
      detail: {
        description:
          "Issues an authorization code for the account behind the caller's own AI Pass cookie. The consent screen on the dashboard calls this once a reader approves an app, and hands the code back through the app's redirect. A thaipass token cannot call this: only the account holder's own cookie may grant an app access, which is what stops one app from minting another app's access.",
        responses: {
          "200": json("CodeResponse", "The authorization code"),
          "400": json("OAuthError", "Malformed request or redirect"),
          "401": json("OAuthError", "Missing or malformed session cookie"),
          "501": json("OAuthError", "This deployment issues no tokens"),
        },
        security: [{ aipassCookie: [] }],
        summary: "Issue an authorization code",
        tags: ["Login"],
      },
      parse: "json",
    },
    async ({ body, request, log }) => {
      if (!issuesTokens()) {
        log.set({ status: 501 });
        return status(501, oauthError("unsupported_response_type", NO_TOKENS));
      }

      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, oauthError("invalid_client", lookup.reason));
      }
      if (lookup.grant !== undefined) {
        log.set({ status: 401 });
        return status(
          401,
          oauthError(
            "invalid_client",
            "a thaipass token cannot grant another app access; the account holder's own cookie must"
          )
        );
      }
      if (!redirectAllowed(body.redirect_uri)) {
        log.set({ status: 400 });
        return status(
          400,
          oauthError(
            "invalid_request",
            "redirect_uri must be https, or http on a loopback address for a command line app"
          )
        );
      }

      const { cookie } = lookup;
      const clientId = clientIdFromCookie(cookie);
      const identity = await fetchIdentity(clientId, cookie, request.signal);
      const scopes = parseScopes(body.scope);

      const sealed = seal(
        {
          clientId: body.client_id,
          codeChallenge: body.code_challenge,
          cookie,
          expiresAt: nowSeconds() + CODE_TTL_S,
          redirectUri: body.redirect_uri,
          scope: formatScopes(scopes),
          subject: identity?.userId,
        },
        "code"
      );
      if (!sealed.ok) {
        log.set({ status: 501 });
        return status(501, oauthError("server_error", sealed.reason));
      }

      log.set({
        clientId,
        grantClient: body.client_id,
        grantScope: formatScopes(scopes),
      });
      return {
        code: sealed.token,
        expires_in: CODE_TTL_S,
        scope: formatScopes(scopes),
      };
    }
  )
  .post(
    "/oauth/token",
    {
      body: "TokenRequest",
      detail: {
        description:
          "Exchanges an authorization code for a thaipass token. The code carries the app, the redirect and the PKCE challenge it was issued with, and all three have to match what is sent here. The token that comes back is the account's AI Pass session sealed under this deployment's key: it goes in Authorization: Bearer, or in x-api-key from an Anthropic client, exactly where the cookie used to go. It expires with the AI Pass session, or in thirty days, whichever is sooner. There is no refresh: tokens cannot outlive the session they seal, and signing out of AI Pass ends every one of them at once.",
        responses: {
          "200": json("TokenResponse", "The thaipass token"),
          "400": json("OAuthError", "Malformed request"),
          "401": json(
            "OAuthError",
            "The code does not open, or does not match"
          ),
          "501": json("OAuthError", "This deployment issues no tokens"),
        },
        summary: "Exchange a code for a token",
        tags: ["Login"],
      },
      parse: "json",
    },
    async ({ body, request, log }) => {
      if (!issuesTokens()) {
        log.set({ status: 501 });
        return status(501, oauthError("unsupported_grant_type", NO_TOKENS));
      }

      const opened = unseal(body.code, "code");
      if (!opened.ok) {
        log.set({ authReason: opened.reason, status: 401 });
        return status(401, oauthError("invalid_grant", opened.reason));
      }
      const { claims } = opened;

      if (claims.clientId !== body.client_id) {
        log.set({ status: 401 });
        return status(
          401,
          oauthError("invalid_grant", "the code was issued to another app")
        );
      }
      if (claims.redirectUri !== body.redirect_uri) {
        log.set({ status: 401 });
        return status(
          401,
          oauthError(
            "invalid_grant",
            "the code was issued for another redirect_uri"
          )
        );
      }
      if (
        claims.codeChallenge === undefined ||
        !challengeMatches(claims.codeChallenge, body.code_verifier)
      ) {
        log.set({ status: 401 });
        return status(
          401,
          oauthError("invalid_grant", "the code_verifier does not match")
        );
      }

      const { cookie } = claims;
      const clientId = clientIdFromCookie(cookie);
      const identity = await fetchIdentity(clientId, cookie, request.signal);
      const expiresAt = tokenExpiry(identity?.sessionExpiresAt);

      const sealed = seal({
        clientId: body.client_id,
        cookie,
        expiresAt,
        scope: claims.scope,
        subject: claims.subject ?? identity?.userId,
      });
      if (!sealed.ok) {
        log.set({ status: 501 });
        return status(501, oauthError("server_error", sealed.reason));
      }

      log.set({
        clientId,
        grantClient: body.client_id,
        grantScope: claims.scope,
      });
      return {
        access_token: sealed.token,
        account: accountOf(identity, clientId),
        expires_in: expiresAt - nowSeconds(),
        scope: claims.scope ?? formatScopes(DEFAULT_SCOPES),
        token_type: "Bearer" as const,
      };
    }
  )
  .get(
    "/oauth/userinfo",
    {
      detail: {
        description:
          "Who the credential belongs to, and what it may do. An app calls this after a login to show whose account it is working on; a cookie may call it too, and reports no app and no expiry of its own.",
        responses: {
          "200": json("Userinfo", "The account behind the credential"),
          "401": json("OAuthError", "Missing or malformed credential"),
          "502": json("OAuthError", "AI Pass would not name the account"),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "Read the account behind a token",
        tags: ["Login"],
      },
      response: { 200: "Userinfo", 401: "OAuthError", 502: "OAuthError" },
    },
    async ({ request, log }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, oauthError("invalid_token", lookup.reason));
      }

      const { cookie, grant } = lookup;
      const clientId = clientIdFromCookie(cookie);
      const identity = await fetchIdentity(clientId, cookie, request.signal);
      if (!identity) {
        log.set({ status: 502 });
        return status(
          502,
          oauthError(
            "invalid_token",
            "AI Pass named no account for this credential; it is likely stale"
          )
        );
      }

      log.set({ clientId, grantClient: grant?.clientId });
      return {
        account: accountOf(identity, clientId),
        client_id: grant?.clientId ?? null,
        expires_at: grant?.expiresAt ?? null,
        scope: grant?.scope ?? formatScopes(DEFAULT_SCOPES),
        session_expires_at: identity.sessionExpiresAt ?? null,
      };
    }
  );
