import { hasSessionToken, normalizeCookie } from "@/lib/proxy";

export type PasteOutcome =
  | { cookie: string; kind: "saved" }
  | { kind: "blocked" }
  | { kind: "empty" }
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
    return { kind: "blocked" };
  }
};
