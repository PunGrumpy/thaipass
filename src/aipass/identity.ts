import { z } from "zod";

import { ttlCache } from "../lib/cache";
import { loadJson } from "./request";

const IDENTITY_PATH = "/lms/api/v1/session/session-tier";
const CACHE_TTL_MS = 5 * 60 * 1000;

const identityResponseSchema = z.object({
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

type SessionUser = z.infer<typeof identityResponseSchema>["data"]["user"];

export interface Identity {
  readonly userEmail?: string;
  readonly userId: string;
  readonly userName?: string;
  readonly userTier?: string;
  readonly userTierExp?: number;
}

const isPresent = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const text = (value: string | null | undefined): string | undefined =>
  isPresent(value) ? value : undefined;

/** AI Pass sends `name` as a display handle, separate from the split fields. */
const displayName = (user: SessionUser): string | undefined => {
  const parts = [user.givenName, user.middleName, user.familyName].filter(
    isPresent
  );
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return text(user.name);
};

const cache = ttlCache<Identity>(CACHE_TTL_MS);

const load = async (
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Identity | null> => {
  const payload = await loadJson(
    IDENTITY_PATH,
    identityResponseSchema,
    cookie,
    signal
  );
  if (!payload) {
    return null;
  }
  const { member, user } = payload.data;
  const exp = Number(member?.currentTierExp);
  return {
    userEmail: text(user.email),
    userId: user.id,
    userName: displayName(user),
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
