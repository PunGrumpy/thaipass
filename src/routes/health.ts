import { Elysia } from "elysia";
import { z } from "zod";

import { CHAT_MODELS } from "../aipass/models";
import { config } from "../lib/config";

export const healthSchema = z.object({
  models: z.number().int(),
  ok: z.boolean(),
  origin: z.string(),
});

export type Health = z.infer<typeof healthSchema>;

export const healthRoutes = new Elysia().get("/health", (): Health => ({
  models: CHAT_MODELS.length,
  ok: true,
  origin: config.origin,
}));
