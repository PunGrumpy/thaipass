import { Elysia } from "elysia";

import { config } from "../lib/config.ts";
import { CHAT_MODELS } from "../lib/models.ts";

const health = () => ({
  models: CHAT_MODELS.length,
  ok: true,
  origin: config.origin,
});

export const healthRoutes = new Elysia()
  .get("/health", health)
  .get("/", health);
