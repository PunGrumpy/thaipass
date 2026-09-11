import { creditUsageSchema } from "@thaipass/core/aipass/quotas";
import type { CreditUsage } from "@thaipass/core/aipass/quotas";
import { randomHex } from "@thaipass/core/lib/id";
import type { ToolCall } from "@thaipass/core/tools";
import { z } from "zod";

import type { Reply, StreamWire, Wire } from "../turn";
import { openaiFailure } from "./errors";
import { createdNow } from "./media";

const toolCallSchema = z.object({
  function: z.object({ arguments: z.string(), name: z.string() }),
  id: z.string(),
  type: z.literal("function"),
});

const usageSchema = z.object({
  completion_tokens: z.number().int(),
  cost: z.number().optional(),
  credits: creditUsageSchema.optional(),
  prompt_tokens: z.number().int(),
  total_tokens: z.number().int(),
});

export const chatDeltaSchema = z.object({
  content: z.string().optional(),
  role: z.literal("assistant").optional(),
  tool_calls: z
    .array(toolCallSchema.extend({ index: z.number().int() }))
    .optional(),
});

export const chatCompletionChunkSchema = z.object({
  choices: z.array(
    z.object({
      delta: chatDeltaSchema,
      finish_reason: z.string().nullable(),
      index: z.number().int(),
      logprobs: z.null(),
    })
  ),
  created: z.number().int(),
  id: z.string(),
  model: z.string(),
  object: z.literal("chat.completion.chunk"),
  usage: usageSchema.optional(),
});

export const chatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string(),
      index: z.number().int(),
      logprobs: z.null(),
      message: z.object({
        content: z.string().nullable(),
        role: z.literal("assistant"),
        tool_calls: z.array(toolCallSchema).optional(),
      }),
    })
  ),
  created: z.number().int(),
  id: z.string(),
  model: z.string(),
  object: z.literal("chat.completion"),
  usage: usageSchema,
});

type ChatDelta = z.infer<typeof chatDeltaSchema>;
type ChatCompletionChunk = z.infer<typeof chatCompletionChunkSchema>;
type ChatCompletion = z.infer<typeof chatCompletionSchema>;
type Usage = z.infer<typeof usageSchema>;
type WireToolCall = z.infer<typeof toolCallSchema>;

const PROTOCOL = "openai";
const COMPLETION_ID_LENGTH = 16;
const DONE_FRAME = "data: [DONE]\n\n";

const FINISH_REASONS = new Map([
  ["content-filter", "content_filter"],
  ["tool-calls", "tool_calls"],
]);

const toFinishReason = (reason: string): string =>
  FINISH_REASONS.get(reason) ?? reason;

const usage = (
  inputTokens: number,
  outputTokens: number,
  credits: CreditUsage | undefined,
  cost: number | undefined
): Usage => ({
  completion_tokens: outputTokens,
  cost,
  credits,
  prompt_tokens: inputTokens,
  total_tokens: inputTokens + outputTokens,
});

const toolCall = (call: ToolCall): WireToolCall => ({
  function: { arguments: JSON.stringify(call.input), name: call.name },
  id: `call_${call.id}`,
  type: "function",
});

const chatChunk = (
  id: string,
  model: string,
  created: number,
  delta: ChatDelta,
  finishReason: string | null,
  spent?: Usage
): ChatCompletionChunk => ({
  choices: [{ delta, finish_reason: finishReason, index: 0, logprobs: null }],
  created,
  id,
  model,
  object: "chat.completion.chunk",
  usage: spent,
});

type ChatMessage = ChatCompletion["choices"][number]["message"];

const chatMessage = (reply: Reply): ChatMessage => {
  const message: ChatMessage = {
    content: reply.text.length > 0 ? reply.text : null,
    role: "assistant",
  };
  if (reply.calls.length > 0) {
    message.tool_calls = reply.calls.map(toolCall);
  }
  return message;
};

const chatCompletion = (
  id: string,
  model: string,
  created: number,
  reply: Reply
): ChatCompletion => ({
  choices: [
    {
      finish_reason: toFinishReason(reply.finishReason),
      index: 0,
      logprobs: null,
      message: chatMessage(reply),
    },
  ],
  created,
  id,
  model,
  object: "chat.completion",
  usage: usage(
    reply.inputTokens,
    reply.outputTokens,
    reply.credits,
    reply.cost
  ),
});

/** Every chunk of one stream carries the same id and `created` second. */
export const openaiWire = (model: string): Wire => {
  const id = `chatcmpl-${randomHex(COMPLETION_ID_LENGTH)}`;
  const created = createdNow();
  const chunk = (
    delta: ChatDelta,
    finishReason: string | null,
    spent?: Usage
  ): string =>
    `data: ${JSON.stringify(chatChunk(id, model, created, delta, finishReason, spent))}\n\n`;

  const stream = (inputTokens: number): StreamWire => {
    let index = 0;
    return {
      call: (call) => {
        const frame = chunk(
          { tool_calls: [{ ...toolCall(call), index }] },
          null
        );
        index += 1;
        return frame;
      },
      close: (finishReason, outputTokens, credits, cost) =>
        `${chunk({}, toFinishReason(finishReason), usage(inputTokens, outputTokens, credits, cost))}${DONE_FRAME}`,
      open: () => chunk({ role: "assistant" }, null),
      text: (delta) => chunk({ content: delta }, null),
    };
  };

  return {
    fail: openaiFailure,
    id,
    protocol: PROTOCOL,
    reply: (reply) => Response.json(chatCompletion(id, model, created, reply)),
    stream,
  };
};
