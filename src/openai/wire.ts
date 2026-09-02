import { z } from "zod";

export const chatDeltaSchema = z.object({
  content: z.string().optional(),
  role: z.literal("assistant").optional(),
});

export const chatCompletionChunkSchema = z.object({
  choices: z.array(
    z.object({
      delta: chatDeltaSchema,
      finish_reason: z.string().nullable(),
      index: z.number().int(),
    })
  ),
  created: z.number().int(),
  id: z.string(),
  model: z.string(),
  object: z.literal("chat.completion.chunk"),
});

export const chatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string(),
      index: z.number().int(),
      message: z.object({
        content: z.string(),
        role: z.literal("assistant"),
      }),
    })
  ),
  created: z.number().int(),
  id: z.string(),
  model: z.string(),
  object: z.literal("chat.completion"),
  usage: z.object({
    completion_tokens: z.number().int(),
    prompt_tokens: z.number().int(),
    total_tokens: z.number().int(),
  }),
});

export type ChatDelta = z.infer<typeof chatDeltaSchema>;
export type ChatCompletionChunk = z.infer<typeof chatCompletionChunkSchema>;
export type ChatCompletion = z.infer<typeof chatCompletionSchema>;

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export const chatChunk = (
  id: string,
  model: string,
  delta: ChatDelta,
  finishReason: string | null
): ChatCompletionChunk => ({
  choices: [{ delta, finish_reason: finishReason, index: 0 }],
  created: nowSeconds(),
  id,
  model,
  object: "chat.completion.chunk",
});

export const chatCompletion = (
  id: string,
  model: string,
  content: string,
  finishReason: string
): ChatCompletion => ({
  choices: [
    {
      finish_reason: finishReason,
      index: 0,
      message: { content, role: "assistant" },
    },
  ],
  created: nowSeconds(),
  id,
  model,
  object: "chat.completion",
  usage: { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 },
});
