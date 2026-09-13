import type { TokenGrant } from "@thaipass/core/aipass/session";

/**
 * What an app may do with someone's account, and what it may not.
 *
 * A raw cookie carries no grant and is therefore unscoped: it is the account
 * itself, and the person sending it is the account holder. A thaipass token
 * carries the scopes its owner agreed to on the consent screen, so an app that
 * asked to send chat requests cannot quietly spend a quiz attempt instead.
 */

export const SCOPES = {
  /** Chat, messages and responses: the completions surface. */
  chat: "chat",
  /** The learning site: enrolling, watching, and answering quizzes. */
  lms: "lms",
  /** Images, video and audio, which cost the most credits per call. */
  media: "media",
  /** The account's model catalogue. */
  models: "models",
  /** The credit balance. */
  usage: "usage",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

const ALL: readonly Scope[] = Object.values(SCOPES);
const KNOWN: ReadonlySet<string> = new Set<string>(ALL);

/** What an app gets when it asks for nothing: read the account, talk to it. */
export const DEFAULT_SCOPES: readonly Scope[] = [
  SCOPES.chat,
  SCOPES.models,
  SCOPES.usage,
];

const isScope = (value: string): value is Scope => KNOWN.has(value);

/** Keeps the scopes this gateway knows, in a stable order, without repeats. */
export const parseScopes = (raw: string | undefined): readonly Scope[] => {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_SCOPES;
  }
  const asked = new Set(raw.split(/\s+/u).filter(isScope));
  return asked.size === 0
    ? DEFAULT_SCOPES
    : ALL.filter((scope) => asked.has(scope));
};

export const formatScopes = (scopes: readonly Scope[]): string =>
  scopes.join(" ");

/** The scope a path needs, or null for anything a token may always reach. */
export const scopeForPath = (path: string): Scope | null => {
  if (
    path.startsWith("/v1/chat") ||
    path.startsWith("/v1/messages") ||
    path.startsWith("/v1/responses")
  ) {
    return SCOPES.chat;
  }
  if (
    path.startsWith("/v1/images") ||
    path.startsWith("/v1/videos") ||
    path.startsWith("/v1/audio")
  ) {
    return SCOPES.media;
  }
  if (path.startsWith("/v1/lms")) {
    return SCOPES.lms;
  }
  if (path.startsWith("/v1/models")) {
    return SCOPES.models;
  }
  if (path.startsWith("/v1/usage")) {
    return SCOPES.usage;
  }
  return null;
};

/**
 * A cookie may do anything; a token may do what it was granted. Returns the
 * scope that was missing, so the refusal can name it.
 */
export const missingScope = (
  grant: TokenGrant | undefined,
  path: string
): Scope | null => {
  if (grant === undefined) {
    return null;
  }
  const needed = scopeForPath(path);
  if (needed === null) {
    return null;
  }
  const granted = parseScopes(grant.scope);
  return granted.includes(needed) ? null : needed;
};
