import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { challengeFor } from "@thaipass/core/auth/seal";
import { z } from "zod";

/**
 * The machine half of Login with thaipass: everything the CLI does that is not
 * a socket, kept here so it can be tested without one.
 *
 * The shape is the one every command line tool settled on. The CLI holds a
 * secret it never sends, opens a browser at the consent screen, and listens on
 * a loopback port for the code to come back. Nobody types a cookie, and the
 * page that hands the code over is the dashboard, on the machine's own browser,
 * where the session already is.
 */

const VERIFIER_BYTES = 48;
const STATE_BYTES = 16;
const SECOND_MS = 1000;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

export const DEFAULT_CLIENT_ID = "thaipass-cli";

export interface Pkce {
  readonly challenge: string;
  readonly verifier: string;
}

/** A verifier long enough to be worth nothing to whoever intercepts the code. */
export const createPkce = (): Pkce => {
  const verifier = randomBytes(VERIFIER_BYTES).toString("base64url");
  return { challenge: challengeFor(verifier), verifier };
};

export const createState = (): string =>
  randomBytes(STATE_BYTES).toString("base64url");

export interface AuthorizeLink {
  readonly clientId: string;
  readonly challenge: string;
  readonly redirectUri: string;
  readonly scope?: string;
  readonly state: string;
  readonly webUrl: string;
}

/**
 * The dashboard page to open. The locale prefix is left off on purpose: the
 * site's own middleware adds the reader's language and keeps the query.
 */
export const authorizeUrl = (link: AuthorizeLink): string => {
  const url = new URL("/authorize", link.webUrl);
  url.searchParams.set("client_id", link.clientId);
  url.searchParams.set("code_challenge", link.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", link.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", link.state);
  if (link.scope !== undefined) {
    url.searchParams.set("scope", link.scope);
  }
  return url.toString();
};

export type Callback =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: string };

/**
 * What came back to the loopback port. A state that does not match is the one
 * case worth being blunt about: something else sent this request.
 */
export const readCallback = (rawUrl: string, state: string): Callback => {
  const params = new URL(rawUrl, "http://127.0.0.1").searchParams;
  if (params.get("state") !== state) {
    return { ok: false, reason: "the reply did not carry this login's state" };
  }
  const error = params.get("error");
  if (error) {
    return {
      ok: false,
      reason:
        error === "access_denied"
          ? "the login was cancelled"
          : `refused: ${error}`,
    };
  }
  const code = params.get("code");
  return code
    ? { code, ok: true }
    : { ok: false, reason: "the reply carried no code" };
};

const accountSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string().nullable(),
  organization: z.string().nullable(),
});

const tokenSchema = z.object({
  access_token: z.string(),
  account: accountSchema,
  expires_in: z.number(),
  scope: z.string(),
});

export type Account = z.infer<typeof accountSchema>;
export type TokenReply = z.infer<typeof tokenSchema>;

const errorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/** Trades the code for a token, and says why in words when the gateway will not. */
export const exchangeCode = async (params: {
  readonly clientId: string;
  readonly code: string;
  readonly proxyUrl: string;
  readonly redirectUri: string;
  readonly verifier: string;
}): Promise<TokenReply> => {
  const response = await fetch(`${params.proxyUrl}/oauth/token`, {
    body: JSON.stringify({
      client_id: params.clientId,
      code: params.code,
      code_verifier: params.verifier,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorSchema.safeParse(body);
    throw new Error(
      failure.success
        ? (failure.data.error_description ?? failure.data.error)
        : `the gateway answered ${response.status}`
    );
  }
  return tokenSchema.parse(body);
};

export interface StoredLogin {
  readonly account: Account;
  readonly expiresAt: number;
  readonly proxyUrl: string;
  readonly scope: string;
  readonly token: string;
}

const storedSchema = z.object({
  account: accountSchema,
  expiresAt: z.number(),
  proxyUrl: z.string(),
  scope: z.string(),
  token: z.string(),
});

/** `$XDG_CONFIG_HOME/thaipass/credentials.json`, or the usual place under home. */
export const credentialsPath = (): string => {
  const configHome = process.env.XDG_CONFIG_HOME?.trim();
  const base =
    configHome && configHome.length > 0
      ? configHome
      : path.join(homedir(), ".config");
  return path.join(base, "thaipass", "credentials.json");
};

/** Written for this user alone: the token opens the account until it expires. */
export const saveLogin = async (
  login: StoredLogin,
  target = credentialsPath()
): Promise<void> => {
  await mkdir(path.dirname(target), { mode: DIRECTORY_MODE, recursive: true });
  await writeFile(target, `${JSON.stringify(login, null, 2)}\n`, {
    mode: FILE_MODE,
  });
  await chmod(target, FILE_MODE);
};

export const readLogin = async (
  target = credentialsPath()
): Promise<StoredLogin | null> => {
  try {
    const raw = await readFile(target, "utf-8");
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const forgetLogin = async (
  target = credentialsPath()
): Promise<boolean> => {
  try {
    await rm(target);
    return true;
  } catch {
    return false;
  }
};

export const loginFrom = (
  reply: TokenReply,
  proxyUrl: string
): StoredLogin => ({
  account: reply.account,
  expiresAt: Math.floor(Date.now() / SECOND_MS) + reply.expires_in,
  proxyUrl,
  scope: reply.scope,
  token: reply.access_token,
});

const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = 3600;

/** How long a stored login has left, in the words a person would use. */
export const describeExpiry = (expiresAt: number): string => {
  const left = expiresAt - Math.floor(Date.now() / SECOND_MS);
  if (left <= 0) {
    return "expired";
  }
  const hours = Math.floor(left / SECONDS_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return hours <= 1 ? "less than an hour left" : `about ${hours} hours left`;
  }
  const days = Math.floor(hours / HOURS_PER_DAY);
  return days === 1 ? "about a day left" : `about ${days} days left`;
};

export const accountLabel = (account: Account): string =>
  account.name ?? account.email ?? account.id;
