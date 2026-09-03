import { Elysia } from "elysia";

import { DEFAULT_MODEL } from "../aipass/models";
import { anthropicErrorSchema } from "../anthropic/errors";
import { messagesRequestSchema, toConversation } from "../anthropic/schema";
import {
  anthropicWire,
  messageSchema,
  messageStreamEventSchema,
} from "../anthropic/wire";
import { requestLogger } from "../lib/logger";
import { json, jsonOrStream } from "../lib/openapi";
import { serveTurn } from "../turn";

export const messageRoutes = new Elysia()
  .use(requestLogger)
  .model({
    AnthropicError: anthropicErrorSchema,
    Message: messageSchema,
    MessageStreamEvent: messageStreamEventSchema,
    MessagesRequest: messagesRequestSchema,
  })
  .post(
    "/v1/messages",
    {
      body: "MessagesRequest",
      detail: {
        description: `Buffered by default, as the Anthropic API is. Send stream: true for the event stream. The system prompt and the conversation are flattened into a single role-labelled turn before they reach AI Pass, images and documents are dropped, max_tokens and the sampling settings are accepted and ignored, and usage is always zero because the upstream reports no token counts. Omitting model uses ${DEFAULT_MODEL}. Tools are offered to the model through the prompt and its calls come back as tool_use blocks, since AI Pass carries text only; how well that works depends on the model following the format.`,
        responses: {
          "200": jsonOrStream(
            "Message",
            "The reply, buffered or streamed",
            "An event: and data: pair per MessageStreamEvent, from message_start to message_stop."
          ),
          "400": json(
            "AnthropicError",
            "Malformed body, or a model outside the catalog"
          ),
          "401": json("AnthropicError", "Missing or malformed session cookie"),
          "502": json(
            "AnthropicError",
            "AI Pass refused the request, often a stale cookie"
          ),
        },
        security: [{ aipassCookieKey: [] }, { aipassCookie: [] }],
        summary: "Create a message",
        tags: ["Messages"],
      },
      parse: "json",
    },
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
