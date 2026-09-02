import { Elysia } from "elysia";

import { CHAT_MODELS } from "../aipass/models.ts";
import { config } from "../lib/config.ts";

const health = () => ({
  models: CHAT_MODELS.length,
  ok: true,
  origin: config.origin,
});

export const healthRoutes = new Elysia()
  .get("/health", health)
  .get("/", health);
