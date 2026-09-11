import { Elysia } from "elysia";

import { env } from "./env";

const LOOPBACK = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u;

const ALLOWED_HEADERS =
  "authorization, content-type, anthropic-version, x-thaipass-app";
const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";
const MAX_AGE = "86400";

const configured = env.AIPASS_CORS_ORIGIN?.split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

const allowAny = configured?.includes("*") === true;
const webOrigin = new URL(env.NEXT_PUBLIC_WEB_URL).origin;

const isAllowed = (origin: string): boolean => {
  if (allowAny) {
    return true;
  }
  if (configured && configured.length > 0) {
    return configured.includes(origin);
  }
  if (origin === webOrigin) {
    return true;
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

  if (request.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }
});
