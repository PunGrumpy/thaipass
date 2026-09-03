import { Elysia, NotFound, ParseError, ValidationError, status } from "elysia";
import { log } from "evlog";

import { anthropicError } from "./anthropic/errors";
import { requestLogger } from "./lib/logger";
import { apiError } from "./openai/errors";
import { chatRoutes } from "./routes/chat";
import { docsRoutes } from "./routes/docs";
import { healthRoutes } from "./routes/health";
import { messageRoutes } from "./routes/messages";
import { modelRoutes } from "./routes/models";
import { usageRoutes } from "./routes/usage";

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
  .use(requestLogger)
  .use(chatRoutes)
  .use(messageRoutes)
  .use(modelRoutes)
  .use(healthRoutes)
  .use(usageRoutes)
  .use(docsRoutes);

export default app;
