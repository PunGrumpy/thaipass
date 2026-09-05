import { Elysia, status } from "elysia";

import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { generateMedia, noAssetMessage } from "../media/generate";
import { apiError, apiErrorSchema } from "../openai/errors";
import {
  aspectRatioFor,
  imageRequestSchema,
  imageResponseSchema,
  toImageResponse,
} from "../openai/images";
import { failMedia } from "./media";

const ONE_PER_REQUEST =
  "AI Pass makes one image per request; send n: 1, or send the request again for another";

export const imageRoutes = new Elysia()
  .use(requestLogger)
  .model({
    ApiError: apiErrorSchema,
    ImageRequest: imageRequestSchema,
    ImageResponse: imageResponseSchema,
  })
  .post(
    "/v1/images/generations",
    {
      body: "ImageRequest",
      detail: {
        description:
          "Generates one image. AI Pass describes an image by its shape rather than its pixel size, so size is reduced to the nearest aspect ratio it offers (1:1, 3:4, 4:3) and aspect_ratio says it outright. The bytes come back as b64_json unless response_format is url; an image too large to carry inline comes back as a link that needs a logged-in browser, whichever format was asked for, with the reason in revised_prompt. usage.credits reports what the image cost.",
        responses: {
          "200": json("ImageResponse", "The generated image"),
          "400": json(
            "ApiError",
            "Malformed body, a model that does not make images, or a model that answered with text"
          ),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json("ApiError", "AI Pass failed the request"),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "Create an image",
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
      if (body.n !== undefined && body.n > 1) {
        log.set({ status: 400 });
        return status(400, apiError(ONE_PER_REQUEST));
      }
      const { cookie } = lookup;
      const aspectRatio = aspectRatioFor(body);
      log.set({
        aspectRatio,
        clientId: clientIdFromCookie(cookie),
        model: body.model,
        promptChars: body.prompt.length,
        protocol: "openai-images",
      });
      try {
        const result = await generateMedia({
          aspectRatio,
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
        return toImageResponse(
          result.assets,
          body.response_format ?? "b64_json",
          result.credits
        );
      } catch (error) {
        return failMedia(error, log, "upstream fetch failed");
      }
    }
  );
