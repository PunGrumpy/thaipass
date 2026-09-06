import { Elysia, NotFound, ParseError, ValidationError, status } from "elysia";
import { log } from "evlog";
import { z } from "zod";

import { anthropicError } from "./anthropic/errors";
import { requestLogger } from "./lib/logger";
import "./lib/settings";
import { apiError } from "./openai/errors";
import { audioRoutes } from "./routes/audio";
import { chatRoutes } from "./routes/chat";
import { docsRoutes } from "./routes/docs";
import { healthRoutes } from "./routes/health";
import { imageRoutes } from "./routes/images";
import { lmsRoutes } from "./routes/lms";
import { messageRoutes } from "./routes/messages";
import { modelRoutes } from "./routes/models";
import { usageRoutes } from "./routes/usage";
import { videoRoutes } from "./routes/videos";

const ANTHROPIC_PREFIX = "/v1/messages";

const errorBody = (path: string, code: number, message: string) =>
  path.startsWith(ANTHROPIC_PREFIX)
    ? anthropicError({ message, status: code })
    : apiError(message);

const reject = (
  request: Request,
  path: string,
  code: number,
  message: string
) => {
  log.warn({
    method: request.method,
    msg: message,
    path,
    status: code,
  });
  return status(code, errorBody(path, code, message));
};

/**
 * What an unknown error can say about itself. A Bun ResolveMessage, thrown
 * when an import cannot be found at runtime, names the specifier and the
 * file that asked for it, which is the whole diagnosis.
 */
const unhandledSchema = z.object({
  importKind: z.string().optional(),
  message: z.string().optional(),
  referrer: z.string().optional(),
  specifier: z.string().optional(),
});

export const app = new Elysia()
  .error(ParseError, ({ request, path }) =>
    reject(request, path, 400, "invalid JSON body")
  )
  .error(ValidationError, ({ request, path, error }) =>
    reject(request, path, 400, `invalid request body: ${error.message}`)
  )
  .error(NotFound, ({ request, path }) =>
    reject(request, path, 404, "not found")
  )
  .error(({ error, request, path }) => {
    if (
      error instanceof ParseError ||
      error instanceof ValidationError ||
      error instanceof NotFound
    ) {
      return;
    }
    const detail = unhandledSchema.safeParse(error);
    const fields = detail.success ? detail.data : {};
    log.error({
      ...fields,
      errName: error instanceof Error ? error.constructor.name : "non-error",
      method: request.method,
      msg: "unhandled error",
      path,
      status: 500,
    });
    const named = [fields.message, fields.specifier]
      .filter((part) => part !== undefined)
      .join(": ");
    return status(
      500,
      errorBody(path, 500, named.length > 0 ? named : "unhandled error")
    );
  })
  .use(requestLogger)
  .use(chatRoutes)
  .use(messageRoutes)
  .use(imageRoutes)
  .use(videoRoutes)
  .use(audioRoutes)
  .use(modelRoutes)
  .use(healthRoutes)
  .use(usageRoutes)
  .use(lmsRoutes)
  .use(docsRoutes);

export default app;
