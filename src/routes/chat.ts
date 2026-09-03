import { Elysia } from "elysia";

import { DEFAULT_MODEL } from "../aipass/models";
import { requestLogger } from "../lib/logger";
import { json, jsonOrStream } from "../lib/openapi";
import { apiErrorSchema, upstreamErrorSchema } from "../openai/errors";
import { chatRequestSchema, toConversation } from "../openai/schema";
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
    UpstreamError: upstreamErrorSchema,
  })
  .post(
    "/v1/chat/completions",
    {
      body: "ChatRequest",
      detail: {
        description: `Streams by default. Send stream: false for one buffered reply. Multi-turn conversations are flattened into a single role-labelled turn before they reach AI Pass, and usage is always zero because the upstream reports no token counts. Omitting model uses ${DEFAULT_MODEL}. Tools are offered to the model through the prompt and its calls are parsed back out of the reply, since AI Pass carries text only; how well that works depends on the model following the format.`,
        responses: {
          "200": jsonOrStream(
            "ChatCompletion",
            "The reply, streamed or buffered",
            "A data: line per ChatCompletionChunk, closed by data: [DONE]."
          ),
          "400": json(
            "ApiError",
            "Malformed body, or a model outside the catalog"
          ),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json(
            "UpstreamError",
            "AI Pass refused the request, often a stale cookie"
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
        wire: openaiWire(model),
      });
    }
  );
