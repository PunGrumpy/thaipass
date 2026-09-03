import { Elysia } from "elysia";
import { z } from "zod";

import { CHAT_MODELS } from "../aipass/models";

export const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      object: z.literal("model"),
      owned_by: z.literal("aipass"),
    })
  ),
  object: z.literal("list"),
});

export type ModelList = z.infer<typeof modelListSchema>;

export const modelRoutes = new Elysia()
  .model({ ModelList: modelListSchema })
  .get(
    "/v1/models",
    {
      detail: {
        description:
          "The chat models the proxy accepts. Ids are case-sensitive and Claude carries a @provider suffix. Needs no credential.",
        summary: "List models",
        tags: ["Chat"],
      },
      response: "ModelList",
    },
    (): ModelList => ({
      data: CHAT_MODELS.map((modelId) => ({
        id: modelId,
        object: "model",
        owned_by: "aipass",
      })),
      object: "list",
    })
  );
