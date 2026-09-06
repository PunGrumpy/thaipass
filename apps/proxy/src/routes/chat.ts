import { DEFAULT_MODEL } from "@thaipass/core/aipass/models";
import { Elysia } from "elysia";

import { requestLogger } from "../lib/logger";
import { json, jsonOrStream } from "../lib/openapi";
import {
  apiErrorSchema,
  requestErrorSchema,
  upstreamErrorSchema,
} from "../openai/errors";
import {
  chatRequestSchema,
  toConversation,
  toThinking,
} from "../openai/schema";
import {
  chatCompletionChunkSchema,
  chatCompletionSchema,
  openaiWire,
} from "../openai/wire";
import { serveTurn } from "../turn";

export const chatRoutes = new Elysia()
  .use(requestLogger)
  .model({
    ApiError: apiErrorSchema,
    ChatCompletion: chatCompletionSchema,
    ChatCompletionChunk: chatCompletionChunkSchema,
    ChatRequest: chatRequestSchema,
    RequestError: requestErrorSchema,
    UpstreamError: upstreamErrorSchema,
  })
  .post(
    "/v1/chat/completions",
    {
      body: "ChatRequest",
      detail: {
        description: `Streams by default. Send stream: false for one buffered reply. The proxy flattens a multi-turn conversation into a single role-labelled turn before it reaches AI Pass, and estimates the token counts in usage from the text because the upstream reports none. usage.credits reports the account's credit balance and what this reply spent instead; on a stream it is on the final chunk. Omitting model uses ${DEFAULT_MODEL}. The proxy offers tools to the model through the prompt and parses its calls back out of the reply, since AI Pass carries text only; how well that works depends on the model following the format.`,
        responses: {
          "200": jsonOrStream(
            "ChatCompletion",
            "The reply, streamed or buffered",
            "A data: line per ChatCompletionChunk, closed by data: [DONE]."
          ),
          "400": json(
            "RequestError",
            "Malformed body, a model the account's catalog does not list, or a prompt the AI Pass edge refused before the model ran"
          ),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json(
            "UpstreamError",
            "AI Pass failed the request, often a stale cookie"
          ),
        },
        security: [{ aipassCookie: [] }],
        summary: "Create a chat completion",
        tags: ["Chat"],
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
        stream: body.stream !== false,
        thinking: toThinking(body),
        wire: openaiWire(model),
      });
    }
  );
