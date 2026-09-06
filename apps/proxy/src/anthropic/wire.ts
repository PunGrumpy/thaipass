import { creditUsageSchema } from "@thaipass/core/aipass/quotas";
import { randomHex } from "@thaipass/core/lib/id";
import type { ToolCall } from "@thaipass/core/tools";
import { z } from "zod";

import type { Reply, StreamWire, Wire } from "../turn";
import { anthropicFailure } from "./errors";

const textBlockSchema = z.object({ text: z.string(), type: z.literal("text") });

const toolUseBlockSchema = z.object({
  id: z.string(),
  input: z.record(z.string(), z.unknown()),
  name: z.string(),
  type: z.literal("tool_use"),
});

const usageSchema = z.object({
  credits: creditUsageSchema.optional(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
});

const deltaUsageSchema = z.object({
  credits: creditUsageSchema.optional(),
  output_tokens: z.number().int(),
});

export const messageSchema = z.object({
  content: z.array(z.union([textBlockSchema, toolUseBlockSchema])),
  id: z.string(),
  model: z.string(),
  role: z.literal("assistant"),
  stop_reason: z.string().nullable(),
  stop_sequence: z.null(),
  type: z.literal("message"),
  usage: usageSchema,
});

export const tokenCountSchema = z.object({
  input_tokens: z.number().int(),
});

export const messageStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ message: messageSchema, type: z.literal("message_start") }),
  z.object({
    content_block: z.union([textBlockSchema, toolUseBlockSchema]),
    index: z.number().int(),
    type: z.literal("content_block_start"),
  }),
  z.object({
    delta: z.union([
      z.object({ text: z.string(), type: z.literal("text_delta") }),
      z.object({
        partial_json: z.string(),
        type: z.literal("input_json_delta"),
      }),
    ]),
    index: z.number().int(),
    type: z.literal("content_block_delta"),
  }),
  z.object({ index: z.number().int(), type: z.literal("content_block_stop") }),
  z.object({
    delta: z.object({ stop_reason: z.string(), stop_sequence: z.null() }),
    type: z.literal("message_delta"),
    usage: deltaUsageSchema,
  }),
  z.object({ type: z.literal("message_stop") }),
]);

type Message = z.infer<typeof messageSchema>;
export type TokenCount = z.infer<typeof tokenCountSchema>;
type Usage = z.infer<typeof usageSchema>;
type MessageStreamEvent = z.infer<typeof messageStreamEventSchema>;
type ToolUseBlock = z.infer<typeof toolUseBlockSchema>;

const PROTOCOL = "anthropic";
const MESSAGE_ID_LENGTH = 24;

const STOP_REASONS = new Map([
  ["content-filter", "refusal"],
  ["length", "max_tokens"],
  ["tool-calls", "tool_use"],
]);

const toStopReason = (reason: string): string =>
  STOP_REASONS.get(reason) ?? "end_turn";

const toolUse = (call: ToolCall): ToolUseBlock => ({
  id: `toolu_${call.id}`,
  input: call.input,
  name: call.name,
  type: "tool_use",
});

const frame = (event: MessageStreamEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const message = (
  id: string,
  model: string,
  content: Message["content"],
  stopReason: string | null,
  usage: Usage
): Message => ({
  content,
  id,
  model,
  role: "assistant",
  stop_reason: stopReason,
  stop_sequence: null,
  type: "message",
  usage,
});

/**
 * Text and tool calls each take a content block of their own, numbered in the
 * order they arrive, so a reply that talks, calls a tool, and talks again is
 * three blocks. Only the text block stays open between deltas.
 */
const streamWire = (
  id: string,
  model: string,
  inputTokens: number
): StreamWire => {
  let index = -1;
  let textOpen = false;
  const closeText = (): string => {
    if (!textOpen) {
      return "";
    }
    textOpen = false;
    return frame({ index, type: "content_block_stop" });
  };
  return {
    call: (call) => {
      const closed = closeText();
      index += 1;
      return (
        closed +
        frame({
          content_block: { ...toolUse(call), input: {} },
          index,
          type: "content_block_start",
        }) +
        frame({
          delta: {
            partial_json: JSON.stringify(call.input),
            type: "input_json_delta",
          },
          index,
          type: "content_block_delta",
        }) +
        frame({ index, type: "content_block_stop" })
      );
    },
    close: (finishReason, outputTokens, credits) =>
      closeText() +
      frame({
        delta: { stop_reason: toStopReason(finishReason), stop_sequence: null },
        type: "message_delta",
        usage: { credits, output_tokens: outputTokens },
      }) +
      frame({ type: "message_stop" }),
    open: () =>
      frame({
        message: message(id, model, [], null, {
          input_tokens: inputTokens,
          output_tokens: 0,
        }),
        type: "message_start",
      }),
    text: (delta) => {
      let opened = "";
      if (!textOpen) {
        index += 1;
        textOpen = true;
        opened = frame({
          content_block: { text: "", type: "text" },
          index,
          type: "content_block_start",
        });
      }
      return (
        opened +
        frame({
          delta: { text: delta, type: "text_delta" },
          index,
          type: "content_block_delta",
        })
      );
    },
  };
};

const reply = (id: string, model: string, value: Reply): Message => {
  const content: Message["content"] = [];
  if (value.text.length > 0) {
    content.push({ text: value.text, type: "text" });
  }
  content.push(...value.calls.map(toolUse));
  return message(id, model, content, toStopReason(value.finishReason), {
    credits: value.credits,
    input_tokens: value.inputTokens,
    output_tokens: value.outputTokens,
  });
};

export const anthropicWire = (model: string): Wire => {
  const id = `msg_${randomHex(MESSAGE_ID_LENGTH)}`;
  return {
    fail: anthropicFailure,
    id,
    protocol: PROTOCOL,
    reply: (value) => Response.json(reply(id, model, value)),
    stream: (inputTokens) => streamWire(id, model, inputTokens),
  };
};
