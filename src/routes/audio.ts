import { Elysia, status } from "elysia";

import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { generateMedia, MediaError, noAssetMessage } from "../media/generate";
import {
  audioRequestSchema,
  audioResponseSchema,
  toAudioResponse,
} from "../openai/audio";
import { apiError, apiErrorSchema } from "../openai/errors";

const UPSTREAM_ERROR = 502;

export const audioRoutes = new Elysia()
  .use(requestLogger)
  .model({
    ApiError: apiErrorSchema,
    AudioRequest: audioRequestSchema,
    AudioResponse: audioResponseSchema,
  })
  .post(
    "/v1/audio/generations",
    {
      body: "AudioRequest",
      detail: {
        description:
          "Generates a music clip. OpenAI's own audio endpoint is text to speech, which is a different thing with a different body, so this keeps the shape the other media endpoints use rather than borrowing a name that would mislead. The clip comes back as b64_json unless response_format is url; one too large to carry inline comes back as a link that needs a logged-in browser, with the reason in note.",
        responses: {
          "200": json("AudioResponse", "The generated clip"),
          "400": json(
            "ApiError",
            "Malformed body, a model that makes no music, or a model that answered with text"
          ),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json("ApiError", "AI Pass failed the request"),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "Create a music clip",
        tags: ["Media"],
      },
      parse: "json",
    },
    async ({ body, request, log }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, apiError(lookup.reason));
      }
      const { cookie } = lookup;
      log.set({
        clientId: clientIdFromCookie(cookie),
        model: body.model,
        promptChars: body.prompt.length,
        protocol: "openai-audio",
      });
      try {
        const result = await generateMedia({
          cookie,
          modelId: body.model,
          prompt: body.prompt,
          signal: request.signal,
        });
        log.set({
          creditsSpent: result.credits?.spent,
          files: result.assets.length,
        });
        if (result.assets.length === 0) {
          log.set({ status: 400 });
          return status(400, apiError(noAssetMessage(result)));
        }
        return toAudioResponse(
          result.assets,
          body.response_format ?? "b64_json",
          result.credits
        );
      } catch (error) {
        if (error instanceof MediaError) {
          log.set({ status: UPSTREAM_ERROR, upstreamStatus: error.status });
          log.error(error);
          return status(UPSTREAM_ERROR, apiError(error.message));
        }
        log.set({ status: UPSTREAM_ERROR });
        log.error(error instanceof Error ? error : new Error(String(error)));
        return status(
          UPSTREAM_ERROR,
          apiError(`upstream fetch failed: ${error}`)
        );
      }
    }
  );
