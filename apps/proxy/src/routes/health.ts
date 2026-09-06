import { CHAT_MODELS } from "@thaipass/core/aipass/models";
import { config } from "@thaipass/core/lib/config";
import { Elysia } from "elysia";
import { z } from "zod";

export const healthSchema = z.object({
  models: z.number().int(),
  ok: z.boolean(),
  origin: z.string(),
});

export type Health = z.infer<typeof healthSchema>;

export const healthRoutes = new Elysia().model({ Health: healthSchema }).get(
  "/health",
  {
    detail: {
      description:
        "Reports the upstream origin and how many chat models the proxy knew when it was built. The proxy checks a request against the account's catalog on GET /v1/models, not this count. Needs no credential.",
      summary: "Health",
      tags: ["Meta"],
    },
    response: "Health",
  },
  (): Health => ({
    models: CHAT_MODELS.length,
    ok: true,
    origin: config.origin,
  })
);
