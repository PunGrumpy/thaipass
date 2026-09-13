/**
 * Connecting a session is a paste, so the paste is what the dashboard is built
 * around: the same clipboard read backs the button on the overview and the one
 * in settings, and both report the same four outcomes.
 *
 * The AI Pass session cookie is `HttpOnly`, so no page — not even one on
 * de.aipass.net — can read it for the reader. A copy out of DevTools is the
 * whole of what a browser allows, which is why the work here goes into taking
 * every shape that copy comes in rather than into avoiding it.
 */

import { hasSessionToken, normalizeCookie } from "@/lib/proxy";

export type PasteOutcome =
  | { cookie: string; kind: "saved" }
  /** The browser refused to hand over the clipboard. */
  | { kind: "blocked" }
  | { kind: "empty" }
  /** Text arrived, but nothing in it was an AI Pass session. */
  | { kind: "invalid" };

export const readPastedSession = (text: string): PasteOutcome => {
  if (!text.trim()) {
    return { kind: "empty" };
  }
  const cookie = normalizeCookie(text);
  if (!cookie) {
    return { kind: "empty" };
  }
  return hasSessionToken(cookie)
    ? { cookie, kind: "saved" }
    : { kind: "invalid" };
};

export const readClipboardSession = async (): Promise<PasteOutcome> => {
  try {
    return readPastedSession(await navigator.clipboard.readText());
  } catch {
    // Firefox and Safari only allow a clipboard read from their own paste
    // gesture, so the field below is the way in there.
    return { kind: "blocked" };
  }
};
