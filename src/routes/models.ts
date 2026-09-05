import { Elysia } from "elysia";
import { z } from "zod";

import { fetchCatalog } from "../aipass/catalog";
import { ANY_MODELS, kindOf, VIDEO_MODELS } from "../aipass/models";
import type { VideoModel } from "../aipass/models";
import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { optionsFor } from "../aipass/video";
import { requestLogger } from "../lib/logger";

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
      id: z.string(),
      kind: z.enum(["chat", "image", "video", "music"]),
      object: z.literal("model"),
      options: videoOptionsSchema.nullable(),
      owned_by: z.literal("aipass"),
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
  .model({ ModelList: modelListSchema })
  .get(
    "/v1/models",
    {
      detail: {
        description:
          "Every model the proxy routes, with what it answers with. kind says which endpoint takes it: chat goes to /v1/chat/completions and /v1/messages, image to /v1/images/generations, video to /v1/videos, music to /v1/audio/generations. options reports what a video model accepts beyond a prompt, which differs per model, so a client can ask rather than guess. thinking reports the reasoning levels a model advertises and is filled in only when a cookie is sent, since reading it needs the account's catalog. Ids are case-sensitive and Claude carries a @provider suffix.",
        responses: undefined,
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "List models",
        tags: ["Chat"],
      },
      response: "ModelList",
    },
    async ({ request, log }): Promise<ModelList> => {
      /** The catalog needs a cookie; without one only `thinking` is unknown and stays null. */
      const lookup = cookieFromRequest(request);
      const catalog = lookup.ok
        ? await fetchCatalog(
            clientIdFromCookie(lookup.cookie),
            lookup.cookie,
            request.signal
          )
        : null;
      log.set({ authenticated: lookup.ok });
      return {
        data: ANY_MODELS.map((modelId) => ({
          id: modelId,
          kind: kindOf(modelId),
          object: "model" as const,
          options: optionsOf(modelId),
          owned_by: "aipass" as const,
          thinking: catalog?.get(modelId)?.thinking ?? null,
        })),
        object: "list" as const,
      };
    }
  );
