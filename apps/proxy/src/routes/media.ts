import { status } from "elysia";
import type { RequestLogger } from "evlog";

import { MediaError } from "../media/generate";
import { apiError } from "../openai/errors";

const UPSTREAM_ERROR = 502;
const RENDER_TIMED_OUT = 504;

export const failMedia = (
  cause: unknown,
  log: RequestLogger,
  doing: string
) => {
  if (cause instanceof MediaError) {
    const code =
      cause.status === RENDER_TIMED_OUT ? RENDER_TIMED_OUT : UPSTREAM_ERROR;
    log.set({ status: code, upstreamStatus: cause.status });
    log.error(cause);
    return status(code, apiError(cause.message));
  }
  log.set({ status: UPSTREAM_ERROR });
  log.error(cause instanceof Error ? cause : new Error(String(cause)));
  return status(UPSTREAM_ERROR, apiError(`${doing}: ${cause}`));
};
