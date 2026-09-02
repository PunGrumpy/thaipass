import { log } from "evlog";
import { z } from "zod";

import { CHAT_MODELS, MEDIA_MODELS } from "./models";
import { loadJson } from "./request";

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
  const listed = await loadJson(CATALOG_PATH, catalogSchema, cookie, signal);
  if (!listed) {
    return null;
  }
  return new Map(
    listed.data.map((entry) => [
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
