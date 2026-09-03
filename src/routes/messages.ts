import { Elysia } from "elysia";

import { DEFAULT_MODEL } from "../aipass/models";
import { messagesRequestSchema, toConversation } from "../anthropic/schema";
import { anthropicWire } from "../anthropic/wire";
import { requestLogger } from "../lib/logger";
import { serveTurn } from "../turn";

export const messageRoutes = new Elysia()
  .use(requestLogger)
  .post(
    "/v1/messages",
    { body: messagesRequestSchema },
    ({ body, request, log, deferEmit }) => {
      const model = body.model ?? DEFAULT_MODEL;
      return serveTurn({
        conversation: toConversation(body),
        deferEmit,
        log,
        model,
        request,
        stream: body.stream === true,
        wire: anthropicWire(model),
      });
    }
  );
