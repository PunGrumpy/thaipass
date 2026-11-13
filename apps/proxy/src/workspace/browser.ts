import { env } from "../lib/env";

export const BROWSER_TOKEN_HEADER = "x-browser-token";

const BROWSERLESS = "wss://production-sfo.browserless.io";
const SECURE_URL = /^wss:\/\//iu;
const ANY_URL = /^wss?:\/\//iu;

const endpointFrom = (value: string, url: RegExp): string =>
  url.test(value) ? value : `${BROWSERLESS}?token=${encodeURIComponent(value)}`;

/** The operator's own browser, from host settings or the CLI, may be a local ws:// one. */
export const ownEndpoint = (value: string): string =>
  endpointFrom(value.trim(), ANY_URL);

/**
 * The browser the caller brings to sign in with. The host runs none, so a
 * request without one has nothing to reach the workspace through.
 */
export const browserEndpoint = (
  request: Request,
  fallback: string | undefined = env.THAIPASS_BROWSER_WS
): string | null => {
  const sent = request.headers.get(BROWSER_TOKEN_HEADER)?.trim();
  // A caller on a shared host may name only a TLS endpoint, never a plain ws:// one such as the host's own localhost.
  if (sent) {
    return endpointFrom(sent, SECURE_URL);
  }
  const own = fallback?.trim();
  return own ? ownEndpoint(own) : null;
};
