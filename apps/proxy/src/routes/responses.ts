import { DEFAULT_MODEL } from "@thaipass/core/aipass/models";
import { Elysia } from "elysia";

import { requestLogger } from "../lib/logger";
import { json, jsonOrStream } from "../lib/openapi";
import {
  apiErrorSchema,
  openaiFailure,
  requestErrorSchema,
  upstreamErrorSchema,
} from "../openai/errors";
import {
  responsesRequestSchema,
  toConversation,
  toThinking,
} from "../openai/responses/schema";
import {
  responseSchema,
  responsesWire,
  responseStreamEventSchema,
} from "../openai/responses/wire";
import { serveTurn } from "../turn";

const NO_STORED_RESPONSE =
  "previous_response_id is not supported, the proxy stores no reply; send the whole conversation in input";

export const responsesRoutes = new Elysia()
  .use(requestLogger)
  .model({
    ApiError: apiErrorSchema,
    RequestError: requestErrorSchema,
    Response: responseSchema,
    ResponseStreamEvent: responseStreamEventSchema,
    ResponsesRequest: responsesRequestSchema,
    UpstreamError: upstreamErrorSchema,
  })
  .post(
    "/v1/responses",
    {
      body: "ResponsesRequest",
      detail: {
        description: `The protocol Codex and the newer OpenAI clients speak. Buffered by default, as the Responses API is. Send stream: true for the event stream, which runs from response.created to response.completed and sends no [DONE] line. The proxy flattens instructions and the whole input list into a single role-labelled turn before it reaches AI Pass, and estimates the token counts in usage from the text because the upstream reports none. usage.credits reports the account's credit balance and what this reply spent instead. Omitting model uses ${DEFAULT_MODEL}. The proxy stores no reply, so it refuses previous_response_id and every turn carries the whole conversation. It offers function tools to the model through the prompt and parses its calls back out of the reply as function_call items, since AI Pass carries text only; it drops a hosted tool such as web_search rather than offering the model something it cannot run.`,
        responses: {
          "200": jsonOrStream(
            "Response",
            "The reply, buffered or streamed",
            "An event: and data: pair per ResponseStreamEvent, from response.created to response.completed."
          ),
          "400": json(
            "RequestError",
            "Malformed body, previous_response_id, a model the account's catalog does not list, or a prompt the AI Pass edge refused before the model ran"
          ),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json(
            "UpstreamError",
            "AI Pass failed the request, often a stale cookie"
          ),
        },
        security: [{ aipassCookie: [] }],
        summary: "Create a model response",
        tags: ["Chat"],
      },
      parse: "json",
    },
    ({ body, request, log, deferEmit }) => {
      if (body.previous_response_id) {
        log.set({ status: 400 });
        return openaiFailure({ message: NO_STORED_RESPONSE, status: 400 });
      }
      const model = body.model ?? DEFAULT_MODEL;
      return serveTurn({
        conversation: toConversation(body),
        deferEmit,
        log,
        model,
        request,
        stream: body.stream === true,
        thinking: toThinking(body),
        wire: responsesWire(model),
      });
    }
  );
