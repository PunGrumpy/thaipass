import { z } from "zod";

import { chatModelSchema } from "../aipass/models";

export type OpenAIRole = "system" | "user" | "assistant" | "tool";

const contentPartSchema = z.union([
  z.string(),
  z
    .object({ text: z.string().optional() })
    .transform((part) => part.text ?? ""),
]);

const contentSchema = z
  .union([
    z.string(),
    z.array(contentPartSchema).transform((parts) => parts.join("")),
    z.unknown().transform((): string => ""),
  ])
  .optional()
  .transform((value): string => value ?? "");

const roleSchema = z
  .union([
    z.enum(["system", "user", "assistant", "tool"]),

    z.unknown().transform((): OpenAIRole => "user"),
  ])
  .optional()
  .transform((value): OpenAIRole => value ?? "user");

const messageSchema = z.object({
  content: contentSchema,
  role: roleSchema,
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).optional(),
  model: chatModelSchema.optional(),
  stream: z.boolean().optional(),
});

export type OpenAIMessage = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
