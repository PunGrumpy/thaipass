/**
 * The AI Pass edge answers some requests itself with a 403 before the chat
 * backend runs, scoring what the prompt contains rather than its length. A
 * retry of the same body gets the same verdict, so the proxy reports it as a
 * request error and hands back the edge's own body.
 */

const EDGE_REFUSAL_STATUS = 403;

export const EDGE_REFUSAL_CLIENT_STATUS = 400;

export const EDGE_REFUSAL_HINT =
  "; the AI Pass edge refused this before the model ran, on what the prompt contains rather than how long it is — resending the same text will be refused again";

export const isEdgeRefusal = (status: number): boolean =>
  status === EDGE_REFUSAL_STATUS;

/**
 * Strings the edge has been measured to refuse, one at a time, on 2026-09-12.
 * The set is what was tested and not a theory about what the rule covers:
 * `dangerouslySetInnerHTML` and the bare word `cookie` both passed, and
 * `eval()` is listed with its parentheses because that is the form that was
 * sent. Expect the real rule to be wider.
 */
const REFUSED_PATTERNS = ["document.cookie", "document.write", "eval()"];

/** Which of the known strings a prompt carries, for naming in an error. */
export const refusedPatternsIn = (text: string): string[] =>
  REFUSED_PATTERNS.filter((pattern) => text.includes(pattern));

export const refusalDetail = (found: readonly string[]): string =>
  found.length === 0
    ? ""
    : `; the prompt contains ${found.join(", ")}, which this edge has refused before`;

/**
 * Header a caller sets to have those strings dropped before the prompt goes
 * upstream. Off by default: this proxy serves callers who did not ask for
 * their text to be edited, and a silent edit is worse than a refusal.
 */
export const WITHHOLD_HEADER = "x-thaipass-withhold";

export const WITHHELD_MARKER =
  "[withheld: the model gateway refuses this text]";

export const wantsWithholding = (headers: Headers): boolean =>
  headers.get(WITHHOLD_HEADER) === "1";

/**
 * Replaces each known string with a marker that says so. The point is to lose
 * the text rather than disguise it: the model is told something was removed,
 * so a reader downstream can be told too.
 */
export interface Withheld {
  readonly text: string;
  readonly withheld: number;
}

export const withholdRefused = (text: string): Withheld => {
  let withheld = 0;
  let out = text;
  for (const pattern of REFUSED_PATTERNS) {
    const parts = out.split(pattern);
    withheld += parts.length - 1;
    out = parts.join(WITHHELD_MARKER);
  }
  return { text: out, withheld };
};
