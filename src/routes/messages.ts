import { Elysia } from "elysia";

import { DEFAULT_MODEL } from "../aipass/models";
import { anthropicErrorSchema } from "../anthropic/errors";
import {
  messagesRequestSchema,
  toConversation,
  toThinking,
} from "../anthropic/schema";
import {
  anthropicWire,
  messageSchema,
  messageStreamEventSchema,
  tokenCountSchema,
} from "../anthropic/wire";
import type { TokenCount } from "../anthropic/wire";
import { requestLogger } from "../lib/logger";
import { json, jsonOrStream } from "../lib/openapi";
import { estimateTokens } from "../tokens";
import { flattenPrompt } from "../translate";
import { serveTurn } from "../turn";

export const messageRoutes = new Elysia()
  .use(requestLogger)
  .model({
    AnthropicError: anthropicErrorSchema,
    Message: messageSchema,
    MessageStreamEvent: messageStreamEventSchema,
    MessagesRequest: messagesRequestSchema,
    TokenCount: tokenCountSchema,
  })
  .post(
    "/v1/messages",
    {
      body: "MessagesRequest",
      detail: {
        description: `Buffered by default, as the Anthropic API is. Send stream: true for the event stream. The proxy flattens the system prompt and the conversation into a single role-labelled turn before they reach AI Pass, uploads images and documents as attachments, accepts and ignores max_tokens and the sampling settings, and estimates the token counts in usage from the text because the upstream reports none. usage.credits reports the account's credit balance and what this reply spent instead; on a stream it is on message_delta. Omitting model uses ${DEFAULT_MODEL}. The proxy offers tools to the model through the prompt and their calls come back as tool_use blocks, since AI Pass carries text only; how well that works depends on the model following the format.`,
        responses: {
          "200": jsonOrStream(
            "Message",
            "The reply, buffered or streamed",
            "An event: and data: pair per MessageStreamEvent, from message_start to message_stop."
          ),
          "400": json(
            "AnthropicError",
            "Malformed body, a model the account's catalog does not list, or a prompt the AI Pass edge refused before the model ran"
          ),
          "401": json("AnthropicError", "Missing or malformed session cookie"),
          "502": json(
            "AnthropicError",
            "AI Pass failed the request, often a stale cookie"
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
        thinking: toThinking(body),
        wire: anthropicWire(model),
      });
    }
  )
  .post(
    "/v1/messages/count_tokens",
    {
      body: "MessagesRequest",
      detail: {
        description:
          "The tokens the prompt would cost, counted on the flattened prompt the proxy would send: the system prompt, the tool guide and the role-labelled turns. AI Pass reports no token counts, so this is an estimate from the text rather than a tokeniser, and it reaches no upstream and needs no credential.",
        responses: {
          "200": json("TokenCount", "The estimated size of the prompt"),
          "400": json("AnthropicError", "Malformed body"),
        },
        summary: "Count message tokens",
        tags: ["Messages"],
      },
      parse: "json",
      response: "TokenCount",
    },
    ({ body }): TokenCount => ({
      input_tokens: estimateTokens(flattenPrompt(toConversation(body))),
    })
  );
