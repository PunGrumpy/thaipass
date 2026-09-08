import { Elysia } from "elysia";

import { env } from "./env";

/**
 * The dashboard is a separate origin from the gateway (`:3000` calling
 * `:3001`), and it sends an `Authorization` header, so every request it makes
 * is preflighted. Without these headers the browser refuses to hand the
 * response back and the page only ever sees "Failed to fetch".
 *
 * The default allows loopback on any port — this is a personal gateway meant
 * to run on the user's own machine. `AIPASS_CORS_ORIGIN` overrides it with an
 * explicit comma-separated list, or `*` to allow anything.
 */
const LOOPBACK = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u;

const ALLOWED_HEADERS = "authorization, content-type, anthropic-version";
const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";
const MAX_AGE = "86400";

const configured = env.AIPASS_CORS_ORIGIN?.split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

const allowAny = configured?.includes("*") === true;

const isAllowed = (origin: string): boolean => {
  if (allowAny) {
    return true;
  }
  if (configured && configured.length > 0) {
    return configured.includes(origin);
  }
  return LOOPBACK.test(origin);
};

const corsHeaders = (origin: string) => ({
  "access-control-allow-headers": ALLOWED_HEADERS,
  "access-control-allow-methods": ALLOWED_METHODS,
  "access-control-allow-origin": allowAny ? "*" : origin,
  "access-control-max-age": MAX_AGE,
  vary: "origin",
});

export const cors = new Elysia({ name: "cors" }).request(({ request, set }) => {
  const origin = request.headers.get("origin");
  if (origin === null || !isAllowed(origin)) {
    return;
  }

  const headers = corsHeaders(origin);
  set.headers = { ...set.headers, ...headers };

  // A preflight never reaches a route, so it has to be answered here.
  if (request.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }
});
