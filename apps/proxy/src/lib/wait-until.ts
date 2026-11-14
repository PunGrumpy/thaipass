/**
 * The platform's `waitUntil` for one request, so work started while serving it
 * can finish after the response is sent. Cloudflare hands it to the Worker's
 * `fetch` beside the request; Bun has none, so a lookup there is undefined and
 * callers fall back to finishing before the response, as they always did.
 */
export type WaitUntil = (promise: Promise<unknown>) => void;

const byRequest = new WeakMap<Request, WaitUntil>();

export const bindWaitUntil = (request: Request, waitUntil: WaitUntil): void => {
  byRequest.set(request, waitUntil);
};

export const waitUntilFor = (request: Request): WaitUntil | undefined =>
  byRequest.get(request);
