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

export const modelRoutes = new Elysia().get("/v1/models", (): ModelList => ({
  data: CHAT_MODELS.map((modelId) => ({
    id: modelId,
    object: "model",
    owned_by: "aipass",
  })),
  object: "list",
}));
