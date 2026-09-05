import { Elysia, status } from "elysia";

import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { generateVideo } from "../media/video";
import { apiError, apiErrorSchema } from "../openai/errors";
import {
  toVideoResponse,
  videoRequestSchema,
  videoResponseSchema,
} from "../openai/videos";
import { failMedia } from "./media";

/** A render takes minutes, and a job left running keeps spending the quota. */
const VIDEO_TIMEOUT_MS = 15 * 60 * 1000;

export const videoRoutes = new Elysia()
  .use(requestLogger)
  .model({
    ApiError: apiErrorSchema,
    VideoRequest: videoRequestSchema,
    VideoResponse: videoResponseSchema,
  })
  .post(
    "/v1/videos",
    {
      body: "VideoRequest",
      detail: {
        description:
          "Renders one video, and blocks until it is done — AI Pass submits a job and polls it, and offers no streaming variant, so neither does this. A render takes minutes. Which options a model takes differs: every model accepts aspect_ratio and style_preprompt, only seedance accepts duration, camera_fixed and generate_audio, and only seedance-2.0-fast and seedance-2.0-mini accept a resolution; an option a model does not take is dropped rather than sent, since the upstream rejects the whole body without naming a field. model is echoed back when AI Pass ran the job on a different one, which it does when the asked-for model is busy.",
        responses: {
          "200": json("VideoResponse", "The rendered video"),
          "400": json(
            "ApiError",
            "Malformed body, or a model that makes no video"
          ),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json("ApiError", "AI Pass failed or refused the job"),
          "504": json(
            "ApiError",
            "The render was still going when the proxy gave up"
          ),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "Create a video",
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
        protocol: "openai-videos",
      });
      try {
        const result = await generateVideo({
          cookie,
          modelId: body.model,
          options: {
            aspectRatio: body.aspect_ratio,
            cameraFixed: body.camera_fixed,
            duration: body.duration,
            generateAudio: body.generate_audio,
            resolution: body.resolution,
            stylePreprompt: body.style_preprompt,
          },
          prompt: body.prompt,
          signal: request.signal,
          timeoutMs: VIDEO_TIMEOUT_MS,
        });
        log.set({
          creditsSpent: result.credits?.spent,
          jobId: result.jobId,
          servedModel: result.servedModel,
        });
        return toVideoResponse(
          result.asset,
          result.jobId,
          body.response_format ?? "url",
          result.servedModel,
          result.credits
        );
      } catch (error) {
        return failMedia(error, log, "video failed");
      }
    }
  );
