import { z } from "zod";

import { ttlCache } from "../lib/cache";
import { loadJson } from "./request";

const TIER_PATH = "/lms/api/v1/session/session-tier";
const SESSION_PATH = "/lms/api/v1/session/";
const CACHE_TTL_MS = 5 * 60 * 1000;

const tierResponseSchema = z.object({
  data: z.object({
    member: z
      .object({
        currentTierExp: z.union([z.string(), z.number()]).nullish(),
        tierName: z.string().nullish(),
      })
      .nullish(),
    user: z.object({
      email: z.string().nullish(),
      familyName: z.string().nullish(),
      givenName: z.string().nullish(),
      id: z.string(),
      middleName: z.string().nullish(),
      name: z.string().nullish(),
    }),
  }),
});

const sessionResponseSchema = z.object({
  data: z.object({
    session: z.object({
      member: z.object({ organizationName: z.string().nullish() }).nullish(),
      session: z.object({ expiresAt: z.string().nullish() }).nullish(),
      user: z.object({ role: z.string().nullish() }).nullish(),
    }),
  }),
});

type TierUser = z.infer<typeof tierResponseSchema>["data"]["user"];

export interface Identity {
  readonly orgName?: string;
  readonly sessionExpiresAt?: string;
  readonly userEmail?: string;
  readonly userId: string;
  readonly userName?: string;
  readonly userRole?: string;
  readonly userTier?: string;
  readonly userTierExp?: number;
}

const isPresent = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const text = (value: string | null | undefined): string | undefined =>
  isPresent(value) ? value : undefined;

/** AI Pass sends `name` as a display handle, separate from the split fields. */
const displayName = (user: TierUser): string | undefined => {
  const parts = [user.givenName, user.middleName, user.familyName].filter(
    isPresent
  );
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return text(user.name);
};

const cache = ttlCache<Identity>(CACHE_TTL_MS);

/**
 * `session-tier` carries the names and the membership tier; `session` carries
 * the cookie expiry and the organization. Only the first is required, so a
 * failure on the second leaves those fields absent instead of losing identity.
 */
const load = async (
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Identity | null> => {
  const [tier, session] = await Promise.all([
    loadJson(TIER_PATH, tierResponseSchema, cookie, signal),
    loadJson(SESSION_PATH, sessionResponseSchema, cookie, signal),
  ]);
  if (!tier) {
    return null;
  }
  const { member, user } = tier.data;
  const exp = Number(member?.currentTierExp);
  const live = session?.data.session;
  return {
    orgName: text(live?.member?.organizationName),
    sessionExpiresAt: text(live?.session?.expiresAt),
    userEmail: text(user.email),
    userId: user.id,
    userName: displayName(user),
    userRole: text(live?.user?.role),
    userTier: text(member?.tierName),
    userTierExp: Number.isFinite(exp) ? exp : undefined,
  };
};

export const fetchIdentity = async (
  clientId: string,
  cookie: string,
  signal?: AbortSignal
): Promise<Identity | null> => {
  const cached = cache.get(clientId);
  if (cached) {
    return cached;
  }
  const identity = await load(cookie, signal);
  if (identity) {
    cache.set(clientId, identity);
  }
  return identity;
};
