import { Elysia, NotFound, ParseError, ValidationError, status } from "elysia";

import { config } from "./lib/config.ts";
import { apiError } from "./lib/http.ts";
import { chatRoutes } from "./routes/chat.ts";
import { healthRoutes } from "./routes/health.ts";
import { modelRoutes } from "./routes/models.ts";

new Elysia()
  // Elysia's error shapes are not OpenAI's. These hooks rewrite each failure
  // it raises into the one shape an OpenAI client reads.
  .error(ParseError, () => status(400, apiError("invalid JSON body")))
  .error(ValidationError, () =>
    status(400, apiError("body must be a chat completion request object"))
  )
  .error(NotFound, () => status(404, apiError("not found")))
  // Elysia picks a body parser from the content-type, but plenty of clients
  // (and curl) POST JSON without setting one. This hook parses those as JSON.
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
