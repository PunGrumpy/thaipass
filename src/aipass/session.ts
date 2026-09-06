import { createHash } from "node:crypto";

const SESSION_TOKEN = "__Secure-ai_passport_auth.session_token";

export type CookieLookup =
  | { readonly ok: true; readonly cookie: string }
  | { readonly ok: false; readonly reason: string };

const NO_HEADER = `missing Authorization header, send the AI Pass Cookie header as "Authorization: Bearer ${SESSION_TOKEN}=...", or as x-api-key from an Anthropic client`;

const NOT_BEARER = "Authorization must use the Bearer scheme";

const NO_TOKEN = `the credential carries no ${SESSION_TOKEN}, send the whole Cookie header from a logged-in browser session rather than the token on its own`;

const withToken = (cookie: string): CookieLookup =>
  cookie.includes(SESSION_TOKEN)
    ? { cookie, ok: true }
    : { ok: false, reason: NO_TOKEN };

/** A cookie handed over directly, as the CLI reads it from the environment or a file. */
export const cookieFromValue = (value: string): CookieLookup =>
  withToken(value.trim());

/** A client sends the cookie as a bearer token or, from an Anthropic client, in `x-api-key`. */
export const cookieFromRequest = (request: Request): CookieLookup => {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    return withToken(apiKey.trim());
  }
  const header = request.headers.get("authorization");
  if (!header) {
    return { ok: false, reason: NO_HEADER };
  }
  const [scheme = "", ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") {
    return { ok: false, reason: NOT_BEARER };
  }
  return withToken(rest.join(" ").trim());
};

const CLIENT_ID_LENGTH = 16;

export const clientIdFromCookie = (cookie: string): string =>
  createHash("sha256").update(cookie).digest("hex").slice(0, CLIENT_ID_LENGTH);
