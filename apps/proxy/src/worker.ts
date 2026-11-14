import { app } from "./app";
import { bindWaitUntil } from "./lib/wait-until";
import type { WaitUntil } from "./lib/wait-until";

/** The slice of Cloudflare's ExecutionContext this entry uses. */
interface WorkerContext {
  readonly waitUntil: WaitUntil;
}

/**
 * The Cloudflare Workers entry; `scripts/build-worker.ts` bundles it with every
 * route precompiled. Bindings arrive through `process.env` (nodejs_compat), so
 * the second argument is not read.
 */
export default {
  fetch: (
    request: Request,
    _bindings: Readonly<Record<string, string>>,
    ctx: WorkerContext
  ): Promise<Response> | Response => {
    bindWaitUntil(request, ctx.waitUntil.bind(ctx));
    return app.fetch(request);
  },
};
