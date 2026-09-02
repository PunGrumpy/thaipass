import { log } from "evlog";
import { z } from "zod";

import { config } from "../lib/config";
import { CHAT_MODELS, MEDIA_MODELS } from "./models";

const CATALOG_PATH = "/loaders/list-models";
const CACHE_TTL_MS = 5 * 60 * 1000;

const catalogSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      isFreeCredit: z.boolean().optional(),
      ready: z.boolean().optional(),
    })
  ),
});

export interface CatalogEntry {
  readonly free: boolean;
  readonly ready: boolean;
}

export type Catalog = ReadonlyMap<string, CatalogEntry>;

interface CacheEntry {
  readonly expiresAt: number;
  readonly catalog: Catalog;
}

const cache = new Map<string, CacheEntry>();

const served: ReadonlySet<string> = new Set<string>([
  ...CHAT_MODELS,
  ...MEDIA_MODELS,
]);

const reportDrift = (catalog: Catalog): void => {
  const unknown = [...catalog.keys()].filter((id) => !served.has(id));
  if (unknown.length > 0) {
    log.warn({
      models: unknown.join(", "),
      msg: "catalog has unserved models",
    });
  }
};

const load = async (
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Catalog | null> => {
  let payload: unknown;
  try {
    const response = await fetch(`${config.origin}${CATALOG_PATH}`, {
      headers: {
        accept: "*/*",
        cookie,
        referer: `${config.origin}/chat`,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": config.userAgent,
      },
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      return null;
    }
    payload = await response.json();
  } catch {
    return null;
  }
  const decoded = catalogSchema.safeParse(payload);
  if (!decoded.success) {
    return null;
  }
  return new Map(
    decoded.data.data.map((entry) => [
      entry.id,
      { free: entry.isFreeCredit ?? false, ready: entry.ready ?? true },
    ])
  );
};

export const fetchCatalog = async (
  clientId: string,
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Catalog | null> => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
  const cached = cache.get(clientId);
  if (cached) {
    return cached.catalog;
  }
  const catalog = await load(cookie, signal);
  if (!catalog) {
    return null;
  }
  cache.set(clientId, { catalog, expiresAt: now + CACHE_TTL_MS });
  reportDrift(catalog);
  return catalog;
};
