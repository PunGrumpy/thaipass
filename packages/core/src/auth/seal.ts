/**
 * Login with thaipass, without a database.
 *
 * An app that wants to talk to this gateway has to prove it may drive someone's
 * AI Pass account. The obvious way is to hand it the session cookie, which is
 * what every client does today: the key in a Codex config or a Claude Code
 * environment variable is the whole account, it cannot be revoked, and it has
 * to be copied again by hand each time AI Pass rotates it.
 *
 * A thaipass token is that cookie sealed under a key only the gateway holds.
 * The app carries the sealed bytes and can read nothing in them; the gateway
 * unseals per request and forwards the cookie upstream as before. Nothing is
 * stored anywhere, so a deployment stays as stateless as it is now, and the
 * promise the README makes — that the gateway keeps no credential — still
 * holds: what it keeps is the key that opens one, not the credential.
 *
 * The same envelope carries the authorization code in the middle of a login,
 * with the PKCE challenge and the app's redirect inside it, so a code cannot be
 * replayed as an access token or spent by another app.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export const TOKEN_PREFIX = "tp_v1_";
export const CODE_PREFIX = "tp_c1_";

/** What a sealed envelope is for. It is authenticated, so one cannot pass as the other. */
export type SealPurpose = "access" | "code";

export interface SealedClaims {
  /** The AI Pass Cookie header this token stands for. */
  readonly cookie: string;
  /** Seconds since the epoch, after which the gateway refuses the token. */
  readonly expiresAt: number;
  /** The app this was issued to, as it named itself. */
  readonly clientId?: string;
  /** Codes only: the redirect the app must present again at the token call. */
  readonly redirectUri?: string;
  /** Codes only: the PKCE challenge, S256 of the app's verifier. */
  readonly codeChallenge?: string;
  /** What the app asked to do, space separated, as OAuth writes scopes. */
  readonly scope?: string;
  /** The AI Pass account, when it was read at issue time. */
  readonly subject?: string;
}

/** The wire shape, with short names because the envelope travels in a header. */
const payloadSchema = z.object({
  a: z.string().optional(),
  c: z.string(),
  h: z.string().optional(),
  r: z.string().optional(),
  s: z.string().optional(),
  sc: z.string().optional(),
  x: z.number(),
});

type Payload = z.infer<typeof payloadSchema>;

const SECOND_MS = 1000;

/** Bytes that authenticated under our own key are still parsed, not trusted. */
const openPayload = (plain: string): Payload | null => {
  try {
    return payloadSchema.parse(JSON.parse(plain));
  } catch {
    return null;
  }
};

export type SealResult =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly reason: string };

export type UnsealResult =
  | { readonly ok: true; readonly claims: SealedClaims }
  | { readonly ok: false; readonly reason: string };

const NO_KEY =
  "this deployment issues no thaipass tokens: set THAIPASS_TOKEN_KEY to a 32 byte base64 key";

const MALFORMED = "the token is not a thaipass token";
const TAMPERED =
  "the token does not open: it is for another deployment, or it was altered";
const EXPIRED = "the token has expired, sign in again";

const prefixFor = (purpose: SealPurpose): string =>
  purpose === "code" ? CODE_PREFIX : TOKEN_PREFIX;

/**
 * The key as bytes, or null when this deployment was never given one. A
 * missing key is not an error: a personal gateway that only ever sees raw
 * cookies needs none, and every path here falls back to that.
 */
export const tokenKey = (): Buffer | null => {
  const raw = process.env.THAIPASS_TOKEN_KEY?.trim();
  if (!raw) {
    return null;
  }
  const key = Buffer.from(raw, "base64");
  return key.length === KEY_BYTES ? key : null;
};

export const issuesTokens = (): boolean => tokenKey() !== null;

/** A fresh key, printed by `thaipass keygen` and pasted into the environment. */
export const generateTokenKey = (): string =>
  randomBytes(KEY_BYTES).toString("base64");

export const seal = (
  claims: SealedClaims,
  purpose: SealPurpose = "access"
): SealResult => {
  const key = tokenKey();
  if (!key) {
    return { ok: false, reason: NO_KEY };
  }

  const payload: Payload = {
    a: claims.clientId,
    c: claims.cookie,
    h: claims.codeChallenge,
    r: claims.redirectUri,
    s: claims.subject,
    sc: claims.scope,
    x: claims.expiresAt,
  };

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  // The purpose is authenticated rather than encrypted: it decides which
  // prefix opens the envelope, so a code cannot be presented as a token.
  cipher.setAAD(Buffer.from(purpose, "utf-8"));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf-8"),
    cipher.final(),
  ]);
  const sealed = Buffer.concat([iv, body, cipher.getAuthTag()]);

  return {
    ok: true,
    token: `${prefixFor(purpose)}${sealed.toString("base64url")}`,
  };
};

export const isSealed = (
  value: string,
  purpose: SealPurpose = "access"
): boolean => value.startsWith(prefixFor(purpose));

export const unseal = (
  value: string,
  purpose: SealPurpose = "access"
): UnsealResult => {
  const prefix = prefixFor(purpose);
  if (!value.startsWith(prefix)) {
    return { ok: false, reason: MALFORMED };
  }
  const key = tokenKey();
  if (!key) {
    return { ok: false, reason: NO_KEY };
  }

  const sealed = Buffer.from(value.slice(prefix.length), "base64url");
  if (sealed.length <= IV_BYTES + TAG_BYTES) {
    return { ok: false, reason: MALFORMED };
  }

  const iv = sealed.subarray(0, IV_BYTES);
  const body = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);

  let plain: string;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(purpose, "utf-8"));
    decipher.setAuthTag(tag);
    plain = decipher.update(body, undefined, "utf-8") + decipher.final("utf-8");
  } catch {
    return { ok: false, reason: TAMPERED };
  }

  const payload = openPayload(plain);
  if (payload === null) {
    return { ok: false, reason: TAMPERED };
  }

  if (payload.x * SECOND_MS <= Date.now()) {
    return { ok: false, reason: EXPIRED };
  }

  return {
    claims: {
      clientId: payload.a,
      codeChallenge: payload.h,
      cookie: payload.c,
      expiresAt: payload.x,
      redirectUri: payload.r,
      scope: payload.sc,
      subject: payload.s,
    },
    ok: true,
  };
};

/** The S256 challenge of a PKCE verifier, as RFC 7636 writes it. */
export const challengeFor = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

/** Compares a challenge without leaking where two values first differ. */
export const challengeMatches = (
  challenge: string,
  verifier: string
): boolean => {
  const expected = Buffer.from(challengeFor(verifier));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
};
