import { Elysia, NotFound, ParseError, ValidationError, status } from "elysia";
import { log } from "evlog";

import { config } from "./lib/config.ts";
import { apiError } from "./lib/http.ts";
import { requestLogger } from "./lib/logger.ts";
import { chatRoutes } from "./routes/chat.ts";
import { healthRoutes } from "./routes/health.ts";
import { modelRoutes } from "./routes/models.ts";

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
  return status(code, apiError(message));
};

new Elysia()
  .error(ParseError, ({ request, path }) =>
    reject(request, path, 400, "invalid JSON body")
  )
  .error(ValidationError, ({ request, path }) =>
    reject(request, path, 400, "body must be a chat completion request object")
  )
  .error(NotFound, ({ request, path }) =>
    reject(request, path, 404, "not found")
  )
  .parse(async ({ request, contentType }) => {
    if (contentType) {
      return;
    }
    return await request.json();
  })
  .use(requestLogger)
  .use(chatRoutes)
  .use(modelRoutes)
  .use(healthRoutes)
  .listen({
    hostname: config.host,
    idleTimeout: config.idleTimeout,
    port: config.port,
  });

log.info({
  msg: "listening",
  origin: config.origin,
  url: `http://${config.host}:${config.port}`,
});
