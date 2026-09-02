import { Elysia } from "elysia";

import { CHAT_MODELS } from "../aipass/models.ts";

export const modelRoutes = new Elysia().get("/v1/models", () => ({
  data: CHAT_MODELS.map((modelId) => ({
    id: modelId,
    object: "model",
    owned_by: "aipass",
  })),
  object: "list",
}));
