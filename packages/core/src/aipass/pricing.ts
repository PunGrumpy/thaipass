import { z } from "zod";

import { ttlCache } from "../lib/cache";
import { config } from "../lib/config";

/**
 * AI Pass meters in credits and publishes no per-token price, so a client
 * that reports money has nothing upstream to read. OpenRouter lists what the
 * same models cost elsewhere, and the proxy already estimates the tokens a
 * turn took, so the two together give a figure in dollars: near enough to
 * budget against, never an invoice. Credits stay the exact number.
 */

const TABLE_TTL_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const USD_PLACES = 6;
/** Google names a deployment on Vertex, OpenRouter names the model. */
const DEPLOYMENT_SUFFIX = "-maas";
/** OpenRouter marks a priced variant of one model, such as `:free`. */
const VARIANT_MARK = ":";
/** OpenRouter marks a model it lists before release. */
const PREVIEW_MARK = "~";

const SEPARATORS = /[^a-z0-9]+/gu;
const EDGE_SEPARATORS = /^-+|-+$/gu;

const listSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      pricing: z
        .object({
          completion: z.string().optional(),
          prompt: z.string().optional(),
        })
        .optional(),
    })
  ),
});

/** Dollars per token, as OpenRouter lists them. */
export interface ModelPrice {
  readonly completion: number;
  readonly prompt: number;
  /** The OpenRouter id the two numbers came from. */
  readonly source: string;
}

export type PriceTable = ReadonlyMap<string, ModelPrice>;

export interface TokenSpend {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * AI Pass ids that no amount of normalising reaches the OpenRouter id for the
 * same weights, because AI Pass names a deployment where OpenRouter names a
 * model.
 */
const ALIASES = new Map([
  ["llama-4-maverick-17b-128e-instruct-fp8-1", "llama-4-maverick"],
  ["llama-4-scout-17b-16e-instruct-1", "llama-4-scout"],
  ["mistral-large-3", "mistral-large-2512"],
]);

const slugOf = (value: string): string =>
  value.toLowerCase().replace(SEPARATORS, "-").replace(EDGE_SEPARATORS, "");

/**
 * The key both sides of the table meet on: an AI Pass id without its
 * `@provider` suffix or its deployment marker, an OpenRouter id without its
 * vendor prefix, each as one lowercase slug.
 */
const keyOf = (model: string): string => {
  const named = model.split("@")[0] ?? model;
  const slug = slugOf(named);
  const bare = slug.endsWith(DEPLOYMENT_SUFFIX)
    ? slug.slice(0, -DEPLOYMENT_SUFFIX.length)
    : slug;
  return ALIASES.get(bare) ?? bare;
};

const priceOf = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return;
  }
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
};

/** The list as OpenRouter publishes it, once it has been read through the schema. */
export type ModelList = z.infer<typeof listSchema>;

export const priceTable = (list: ModelList): PriceTable => {
  const table = new Map<string, ModelPrice>();
  for (const entry of list.data) {
    if (entry.id.includes(VARIANT_MARK)) {
      continue;
    }
    const id = entry.id.startsWith(PREVIEW_MARK) ? entry.id.slice(1) : entry.id;
    const key = slugOf(id.split("/").at(-1) ?? id);
    const completion = priceOf(entry.pricing?.completion);
    const prompt = priceOf(entry.pricing?.prompt);
    if (completion === undefined || prompt === undefined || table.has(key)) {
      continue;
    }
    table.set(key, { completion, prompt, source: id });
  }
  return table;
};

/** Keyed by source, so pointing the proxy at another list starts it clean. */
const cache = ttlCache<PriceTable>(TABLE_TTL_MS);
const cooldown = ttlCache<boolean>(RETRY_AFTER_MS);
const inFlight = new Map<string, Promise<PriceTable | null>>();

const load = async (url: string): Promise<PriceTable | null> => {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const list = listSchema.safeParse(await response.json());
    return list.success ? priceTable(list.data) : null;
  } catch {
    return null;
  }
};

/** One fetch per source at a time, however many turns ask for it at once. */
const loadOnce = async (url: string): Promise<PriceTable | null> => {
  try {
    return await load(url);
  } finally {
    inFlight.delete(url);
  }
};

/**
 * The price table, straight from cache once it is warm. A cold start costs
 * one request to OpenRouter, and a list that is down is remembered for a few
 * minutes so the next replies do not wait on it again. A null table means no
 * reply carries a cost, never that a reply fails.
 */
export const modelPrices = async (): Promise<PriceTable | null> => {
  const { pricesUrl } = config;
  if (pricesUrl === null) {
    return null;
  }
  const cached = cache.get(pricesUrl);
  if (cached) {
    return cached;
  }
  if (cooldown.get(pricesUrl)) {
    return null;
  }
  let pending = inFlight.get(pricesUrl);
  if (!pending) {
    pending = loadOnce(pricesUrl);
    inFlight.set(pricesUrl, pending);
  }
  const table = await pending;
  if (table === null) {
    cooldown.set(pricesUrl, true);
    return null;
  }
  cache.set(pricesUrl, table);
  return table;
};

const round = (value: number): number => {
  const scale = 10 ** USD_PLACES;
  return Math.round(value * scale) / scale;
};

export const priceFor = (
  model: string,
  table: PriceTable | null
): ModelPrice | undefined => table?.get(keyOf(model));

/**
 * What the turn's tokens would cost at OpenRouter's list price, or nothing
 * for a model OpenRouter does not list. The token counts are the proxy's own
 * estimate, so this is an estimate twice over.
 */
export const costOf = (
  model: string,
  spend: TokenSpend,
  table: PriceTable | null
): number | undefined => {
  const price = priceFor(model, table);
  if (!price) {
    return;
  }
  return round(
    spend.inputTokens * price.prompt + spend.outputTokens * price.completion
  );
};
