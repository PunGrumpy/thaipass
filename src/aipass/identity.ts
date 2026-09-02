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
      id: z.string(),
      name: z.string().nullish(),
    }),
  }),
});

export interface Identity {
  readonly userId: string;
  readonly userName?: string;
  readonly userTier?: string;
  readonly userTierExp?: number;
}

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
    userId: user.id,
    userName: user.name ?? undefined,
    userTier: member?.tierName ?? undefined,
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
