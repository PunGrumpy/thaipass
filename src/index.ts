import { Elysia, NotFound, ParseError, ValidationError, status } from "elysia";

import { config } from "./lib/config.ts";
import { apiError } from "./lib/http.ts";
import { chatRoutes } from "./routes/chat.ts";
import { healthRoutes } from "./routes/health.ts";
import { modelRoutes } from "./routes/models.ts";

new Elysia()

  .error(ParseError, () => status(400, apiError("invalid JSON body")))
  .error(ValidationError, () =>
    status(400, apiError("body must be a chat completion request object"))
  )
  .error(NotFound, () => status(404, apiError("not found")))

  .parse(async ({ request, contentType }) => {
    if (contentType) {
      return;
    }
    return await request.json();
  })
  .use(chatRoutes)
  .use(modelRoutes)
  .use(healthRoutes)
  .listen({
    hostname: config.host,
    idleTimeout: config.idleTimeout,
    port: config.port,
  });

console.error(
  `aipass-proxy on http://${config.host}:${config.port} -> ${config.origin}`
);
