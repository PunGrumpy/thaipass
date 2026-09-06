import { Elysia } from "elysia";
import { createRequestLogger, initLogger } from "evlog";
import type { DrainContext } from "evlog";
import { createPostHogDrain } from "evlog/posthog";

import { clientFields } from "./client";
import { env } from "./env";

const posthog = env.POSTHOG_API_KEY
  ? createPostHogDrain({
      apiKey: env.POSTHOG_API_KEY,
      distinctIdField: "userId",
      eventName: "aipass_proxy_request",
      host: env.POSTHOG_HOST,
      mode: "events",
    })
  : undefined;

const requestsOnly = (ctx: DrainContext | DrainContext[]): Promise<void> => {
  if (!posthog) {
    return Promise.resolve();
  }
  const batch = Array.isArray(ctx) ? ctx : [ctx];
  const requests = batch.filter((entry) => entry.event.path !== undefined);
  if (requests.length === 0) {
    return Promise.resolve();
  }
  return posthog(requests);
};

initLogger({
  drain: posthog ? requestsOnly : undefined,
  env: { service: "aipass-proxy" },
  redact: {
    builtins: ["creditCard", "jwt", "bearer", "phone", "iban"],
  },
});

export interface DeferredEmit {
  value: boolean;
}

export const requestLogger = new Elysia({ name: "request-logger" })
  .derive(({ request }) => {
    const log = createRequestLogger({
      method: request.method,
      path: new URL(request.url).pathname,
    });
    log.set({ status: 200, ...clientFields(request) });
    return { deferEmit: { value: false }, log };
  })
  .afterResponse(({ log, deferEmit }) => {
    if (deferEmit?.value) {
      return;
    }
    log?.emit();
  })
  .as("global");
