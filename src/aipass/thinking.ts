import { z } from "zod";

import type { CatalogEntry } from "./catalog";

/**
 * How hard a model is asked to think, in the shape AI Pass takes.
 *
 * The upstream field is `thinkingLevel` on the send-message body, and a model
 * advertises the levels it will take under `thinkingConfig.supportedLevels` in
 * the catalog. `max` is offered by Claude Opus alone, which is why the set here
 * is wider than the three every reasoning model shares.
 */
export const THINKING_LEVELS = ["low", "medium", "high", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const thinkingLevelSchema = z.enum(THINKING_LEVELS);

/** The levels to assume for a model whose catalog entry could not be read. */
const COMMON_LEVELS: readonly string[] = ["low", "medium", "high"];

const MEDIUM_FROM = 4096;
const HIGH_FROM = 16_384;

/**
 * Anthropic meters reasoning in tokens and AI Pass in levels, so a budget has
 * to pick one. The thresholds are the proxy's own: AI Pass publishes no token
 * figure for a level, and there is none to derive one from.
 */
export const levelForBudget = (budgetTokens: number): ThinkingLevel => {
  if (budgetTokens < MEDIUM_FROM) {
    return "low";
  }
  return budgetTokens < HIGH_FROM ? "medium" : "high";
};

export interface ResolvedThinking {
  /** The level to send, or null when the model will not take the one asked for. */
  readonly level: ThinkingLevel | null;
  /** Why it was dropped, for a warning the caller can see. */
  readonly dropped?: string;
}

/**
 * A model that does not offer the level asked for is not an error: the reply is
 * still the one the caller wanted, thought about differently. The level is
 * dropped and named instead, the way every other unsupported setting is.
 *
 * A catalog that could not be read falls back to the three levels every
 * reasoning model shares, so a request made before the first read is not
 * stripped of a level the model would in fact have taken.
 */
export const resolveThinking = (
  asked: ThinkingLevel | undefined,
  entry?: CatalogEntry
): ResolvedThinking => {
  if (asked === undefined) {
    return { level: null };
  }
  const advertised = entry?.thinking;
  const allowed =
    advertised && advertised.length > 0 ? advertised : COMMON_LEVELS;
  if (allowed.includes(asked)) {
    return { level: asked };
  }
  return {
    dropped: `the model does not offer thinking level ${asked}, it offers ${allowed.join(", ")}`,
    level: null,
  };
};
