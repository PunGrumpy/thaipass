import type { z } from "zod";

import { config } from "../lib/config";

export const browserGetHeaders = (cookie: string, referer: string) => ({
  accept: "*/*",
  "accept-language": "th-TH,th;q=0.9,en;q=0.8",
  cookie,
  origin: config.origin,
  referer,
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent": config.userAgent,
});

export const browserPostHeaders = (
  cookie: string,
  referer: string,
  contentType: string
) => ({
  ...browserGetHeaders(cookie, referer),
  "content-type": contentType,
});

/** Headers for a JSON action made from inside one conversation's page. */
export const conversationJsonHeaders = (
  cookie: string,
  conversationId: string
) =>
  browserPostHeaders(
    cookie,
    `${config.origin}/chat/${conversationId}`,
    "application/json"
  );

/**
 * Why a loader came back empty. Short enough to put on a wide event, and
 * specific enough to act on: a status is upstream's own answer, `network`
 * never reached it, and `schema` means upstream changed a field.
 */
export type LoadFailure = "network" | "schema" | `upstream ${number}`;

export interface Loaded<T> {
  readonly data: T | null;
  readonly failure: LoadFailure | null;
}

/**
 * A cookie upstream will not honour: it answers 401, or sends the browser to
 * sign-in. 403 is the edge refusal, which is about the prompt, not the session.
 */
export const isStaleFailure = (failure: LoadFailure | null): boolean =>
  failure === "upstream 401" || (failure?.startsWith("upstream 3") ?? false);

/**
 * The same GET as {@link loadJson}, keeping why it failed. A caller that
 * answers an HTTP request needs the reason: "no catalog" reads identically
 * whether the cookie is dead, the network blinked, or upstream renamed a
 * field, and those want three different fixes.
 */
export const loadJsonResult = async <T>(
  path: string,
  schema: z.ZodType<T>,
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Loaded<T>> => {
  let payload: unknown;
  try {
    const response = await fetch(`${config.origin}${path}`, {
      headers: browserGetHeaders(cookie, `${config.origin}/chat`),
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      return { data: null, failure: `upstream ${response.status}` };
    }
    payload = await response.json();
  } catch {
    return { data: null, failure: "network" };
  }
  const decoded = schema.safeParse(payload);
  return decoded.success
    ? { data: decoded.data, failure: null }
    : { data: null, failure: "schema" };
};

/** The body alone, for a loader whose caller has nowhere to put the reason. */
export const loadJson = async <T>(
  path: string,
  schema: z.ZodType<T>,
  cookie: string,
  signal: AbortSignal | undefined
): Promise<T | null> => {
  const loaded = await loadJsonResult(path, schema, cookie, signal);
  return loaded.data;
};
