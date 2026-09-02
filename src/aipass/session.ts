import { createHash } from "node:crypto";

const SESSION_TOKEN = "__Secure-ai_passport_auth.session_token";

export type CookieLookup =
  | { readonly ok: true; readonly cookie: string }
  | { readonly ok: false; readonly reason: string };

const NO_HEADER = `missing Authorization header, send the AI Pass Cookie header as "Authorization: Bearer ${SESSION_TOKEN}=..."`;

const NOT_BEARER = "Authorization must use the Bearer scheme";

const NO_TOKEN = `the bearer value carries no ${SESSION_TOKEN}, send the whole Cookie header from a logged-in browser session rather than the token on its own`;

export const cookieFromRequest = (request: Request): CookieLookup => {
  const header = request.headers.get("authorization");
  if (!header) {
    return { ok: false, reason: NO_HEADER };
  }
  const [scheme = "", ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") {
    return { ok: false, reason: NOT_BEARER };
  }
  const cookie = rest.join(" ").trim();
  if (!cookie.includes(SESSION_TOKEN)) {
    return { ok: false, reason: NO_TOKEN };
  }
  return { cookie, ok: true };
};

const CLIENT_ID_LENGTH = 16;

export const clientIdFromCookie = (cookie: string): string =>
  createHash("sha256").update(cookie).digest("hex").slice(0, CLIENT_ID_LENGTH);
