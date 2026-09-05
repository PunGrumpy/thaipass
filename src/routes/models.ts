import { Elysia, status } from "elysia";
import { z } from "zod";

import { fetchCatalog } from "../aipass/catalog";
import { kindOf, VIDEO_MODELS } from "../aipass/models";
import type { VideoModel } from "../aipass/models";
import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { optionsFor } from "../aipass/video";
import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { apiError, apiErrorSchema } from "../openai/errors";

const NO_CATALOG =
  "AI Pass reported no model catalog; the cookie is likely stale";

const videoOptionsSchema = z.object({
  aspectRatio: z.boolean(),
  cameraFixed: z.boolean(),
  duration: z.boolean(),
  generateAudio: z.boolean(),
  provider: z.string().nullable(),
  resolutions: z.array(z.string()).readonly().nullable(),
  stylePreprompt: z.boolean(),
});

export const modelListSchema = z.object({
  data: z.array(
    z.object({
      free: z.boolean(),
      id: z.string(),
      kind: z.enum(["chat", "image", "video", "music"]),
      object: z.literal("model"),
      options: videoOptionsSchema.nullable(),
      owned_by: z.literal("aipass"),
      ready: z.boolean(),
      thinking: z.array(z.string()).readonly().nullable(),
    })
  ),
  object: z.literal("list"),
});

export type ModelList = z.infer<typeof modelListSchema>;

/** SAFETY: the predicate is the membership test, so the widening is what it checks. */
const isVideo = (id: string): id is VideoModel =>
  (VIDEO_MODELS as readonly string[]).includes(id);

type VideoOptionSurface = z.infer<typeof videoOptionsSchema>;

const optionsOf = (id: string): VideoOptionSurface | null =>
  isVideo(id) ? optionsFor(id) : null;

export const modelRoutes = new Elysia()
  .use(requestLogger)
  .model({ ApiError: apiErrorSchema, ModelList: modelListSchema })
  .get(
    "/v1/models",
    {
      detail: {
        description:
          "The account's catalog as AI Pass lists it, so a model upstream adds shows up without a proxy release. kind says which endpoint takes the model: chat goes to /v1/chat/completions and /v1/messages, image to /v1/images/generations, video to /v1/videos, music to /v1/audio/generations. An id the proxy has not met counts as chat. free says the model spends no credits. ready says upstream reports it as serving. options reports what a video model accepts beyond a prompt, which differs per model, so a client can ask rather than guess. thinking reports the reasoning levels a model advertises. Ids are case-sensitive and Claude carries a @provider suffix.",
        responses: {
          "200": json("ModelList", "The account's model catalog"),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json(
            "ApiError",
            "AI Pass reported no catalog, often a stale cookie"
          ),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "List models",
        tags: ["Chat"],
      },
      response: { 200: "ModelList", 401: "ApiError", 502: "ApiError" },
    },
    async ({ request, log }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, apiError(lookup.reason));
      }
      const { cookie } = lookup;
      const clientId = clientIdFromCookie(cookie);
      log.set({ clientId });
      const catalog = await fetchCatalog(clientId, cookie, request.signal);
      if (!catalog) {
        log.set({ status: 502 });
        return status(502, apiError(NO_CATALOG));
      }
      log.set({ modelCount: catalog.size });
      const listing: ModelList = {
        data: [...catalog].map(([modelId, entry]) => ({
          free: entry.free,
          id: modelId,
          kind: kindOf(modelId),
          object: "model" as const,
          options: optionsOf(modelId),
          owned_by: "aipass" as const,
          ready: entry.ready,
          thinking: entry.thinking,
        })),
        object: "list" as const,
      };
      return listing;
    }
  );
