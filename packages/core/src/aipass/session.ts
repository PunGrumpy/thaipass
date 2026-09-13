import { createHash } from "node:crypto";

import { isSealed, unseal } from "../auth/seal";

const SESSION_TOKEN = "__Secure-ai_passport_auth.session_token";

export type CookieLookup =
  | {
      readonly ok: true;
      readonly cookie: string;
      /** Set when the caller arrived with a thaipass token rather than a cookie. */
      readonly grant?: TokenGrant;
    }
  | { readonly ok: false; readonly reason: string };

export interface TokenGrant {
  readonly clientId?: string;
  readonly expiresAt: number;
  readonly scope?: string;
  readonly subject?: string;
}

const NO_HEADER = `missing Authorization header, send a thaipass token from "thaipass login", or the AI Pass Cookie header as "Authorization: Bearer ${SESSION_TOKEN}=...", or as x-api-key from an Anthropic client`;

const NOT_BEARER = "Authorization must use the Bearer scheme";

const NO_TOKEN = `the credential carries no ${SESSION_TOKEN}, send the whole Cookie header from a logged-in browser session rather than the token on its own`;

const withToken = (cookie: string, grant?: TokenGrant): CookieLookup => {
  if (!cookie.includes(SESSION_TOKEN)) {
    return { ok: false, reason: NO_TOKEN };
  }
  return grant ? { cookie, grant, ok: true } : { cookie, ok: true };
};

/**
 * Two credentials reach the same account. A thaipass token is the cookie
 * sealed under this deployment's key, which is what `thaipass login` hands an
 * app; a raw Cookie header is what a personal setup has always sent. Unsealing
 * happens here, once, so every route accepts either without knowing about it.
 */
const resolve = (value: string): CookieLookup => {
  const credential = value.trim();
  if (!isSealed(credential)) {
    return withToken(credential);
  }
  const opened = unseal(credential);
  if (!opened.ok) {
    return { ok: false, reason: opened.reason };
  }
  const { claims } = opened;
  return withToken(claims.cookie, {
    clientId: claims.clientId,
    expiresAt: claims.expiresAt,
    scope: claims.scope,
    subject: claims.subject,
  });
};

/** A credential handed over directly, as the CLI reads it from the environment or a file. */
export const cookieFromValue = (value: string): CookieLookup => resolve(value);

/** A client sends the credential as a bearer token or, from an Anthropic client, in `x-api-key`. */
export const cookieFromRequest = (request: Request): CookieLookup => {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    return resolve(apiKey);
  }
  const header = request.headers.get("authorization");
  if (!header) {
    return { ok: false, reason: NO_HEADER };
  }
  const [scheme = "", ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") {
    return { ok: false, reason: NOT_BEARER };
  }
  return resolve(rest.join(" "));
};

const CLIENT_ID_LENGTH = 16;

export const clientIdFromCookie = (cookie: string): string =>
  createHash("sha256").update(cookie).digest("hex").slice(0, CLIENT_ID_LENGTH);
