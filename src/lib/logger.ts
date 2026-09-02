import { Elysia } from "elysia";
import { createRequestLogger, initLogger } from "evlog";

initLogger({
  env: { service: "aipass-proxy" },
  redact: true,
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
    log.set({ status: 200 });
    return { deferEmit: { value: false }, log };
  })
  .afterResponse(({ log, deferEmit }) => {
    if (deferEmit?.value) {
      return;
    }
    log?.emit();
  })
  .as("global");
