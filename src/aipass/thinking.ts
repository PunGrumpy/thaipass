import { z } from "zod";

import type { CatalogEntry } from "./catalog";

/**
 * Sent as `thinkingLevel` on the send-message body; a model advertises its
 * levels under `thinkingConfig.supportedLevels`. Only Claude Opus offers `max`.
 */
export const THINKING_LEVELS = ["low", "medium", "high", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const thinkingLevelSchema = z.enum(THINKING_LEVELS);

/** The levels to assume for a model whose catalog entry could not be read. */
const COMMON_LEVELS: readonly string[] = ["low", "medium", "high"];

const MEDIUM_FROM = 4096;
const HIGH_FROM = 16_384;

/** The thresholds are the proxy's own: AI Pass publishes no token figure for a level. */
export const levelForBudget = (budgetTokens: number): ThinkingLevel => {
  if (budgetTokens < MEDIUM_FROM) {
    return "low";
  }
  return budgetTokens < HIGH_FROM ? "medium" : "high";
};

export interface ResolvedThinking {
  readonly level: ThinkingLevel | null;
  readonly dropped?: string;
}

/**
 * An unsupported level is dropped and named, like any other unsupported
 * setting. An unread catalog falls back to the common three so a cold cache
 * does not strip a level the model would have taken.
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
