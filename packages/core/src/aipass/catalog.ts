import { z } from "zod";

import { ttlCache } from "../lib/cache";
import { config } from "../lib/config";
import { CHAT_MODELS, kindOf, MEDIA_MODELS } from "./models";
import type { ModelKind } from "./models";
import { loadJson } from "./request";

const CATALOG_PATH = "/loaders/list-models";
const CACHE_TTL_MS = 5 * 60 * 1000;

const catalogSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      isFreeCredit: z.boolean().optional(),
      ready: z.boolean().optional(),
      thinkingConfig: z
        .object({ supportedLevels: z.array(z.string()).optional() })
        .optional(),
    })
  ),
});

export interface CatalogEntry {
  readonly free: boolean;
  readonly ready: boolean;
  readonly thinking: readonly string[] | null;
}

export type Catalog = ReadonlyMap<string, CatalogEntry>;

const cache = ttlCache<Catalog>(CACHE_TTL_MS);

const knownChat: ReadonlySet<string> = new Set<string>(CHAT_MODELS);

const served: ReadonlySet<string> = new Set<string>([
  ...CHAT_MODELS,
  ...MEDIA_MODELS,
]);

const MEDIA_ROUTES = {
  image: "/v1/images/generations",
  music: "/v1/audio/generations",
  video: "/v1/videos",
} as const satisfies Record<Exclude<ModelKind, "chat">, string>;

/**
 * Why a chat request may not name the model, or null when it may. The
 * account's catalog decides: an id upstream added after the build passes,
 * and one upstream retired does not. When the catalog cannot be read the
 * built-in list stands in rather than refusing everything.
 */
export const chatModelProblem = (
  model: string,
  catalog: Catalog | null
): string | null => {
  const kind = kindOf(model);
  if (kind !== "chat") {
    return `${model} makes ${kind}, send it to ${MEDIA_ROUTES[kind]}`;
  }
  if (catalog) {
    return catalog.has(model)
      ? null
      : `unknown model ${model}, the account's catalog does not list it, see GET /v1/models`;
  }
  return knownChat.has(model)
    ? null
    : `unknown model ${model}, see GET /v1/models`;
};

const reportDrift = (catalog: Catalog): void => {
  const unknown = [...catalog.keys()].filter((id) => !served.has(id));
  if (unknown.length > 0) {
    config.logger.warn({
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
      {
        free: entry.isFreeCredit ?? false,
        ready: entry.ready ?? true,
        thinking: entry.thinkingConfig?.supportedLevels ?? null,
      },
    ])
  );
};

export const fetchCatalog = async (
  clientId: string,
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Catalog | null> => {
  const cached = cache.get(clientId);
  if (cached) {
    return cached;
  }
  const catalog = await load(cookie, signal);
  if (!catalog) {
    return null;
  }
  cache.set(clientId, catalog);
  reportDrift(catalog);
  return catalog;
};
