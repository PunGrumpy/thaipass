import { creditUsageSchema } from "@thaipass/core/aipass/quotas";
import type { CreditUsage } from "@thaipass/core/aipass/quotas";
import { randomHex } from "@thaipass/core/lib/id";
import type { ToolCall } from "@thaipass/core/tools";
import { z } from "zod";

import type { Reply, StreamWire, Wire } from "../../turn";
import { openaiFailure } from "../errors";
import { createdNow } from "../media";

const outputTextSchema = z.object({
  annotations: z.array(z.unknown()),
  text: z.string(),
  type: z.literal("output_text"),
});

const messageItemSchema = z.object({
  content: z.array(outputTextSchema),
  id: z.string(),
  role: z.literal("assistant"),
  status: z.string(),
  type: z.literal("message"),
});

const functionCallItemSchema = z.object({
  arguments: z.string(),
  call_id: z.string(),
  id: z.string(),
  name: z.string(),
  status: z.string(),
  type: z.literal("function_call"),
});

const outputItemSchema = z.union([messageItemSchema, functionCallItemSchema]);

const usageSchema = z.object({
  credits: creditUsageSchema.optional(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  total_tokens: z.number().int(),
});

export const responseSchema = z.object({
  created_at: z.number().int(),
  error: z.null(),
  id: z.string(),
  incomplete_details: z.object({ reason: z.string() }).nullable(),
  model: z.string(),
  object: z.literal("response"),
  output: z.array(outputItemSchema),
  parallel_tool_calls: z.boolean(),
  status: z.string(),
  usage: usageSchema.optional(),
});

const numbered = { sequence_number: z.number().int() };
const itemFields = { output_index: z.number().int(), ...numbered };
const partFields = {
  content_index: z.number().int(),
  item_id: z.string(),
  ...itemFields,
};

export const responseStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    response: responseSchema,
    ...numbered,
    type: z.literal("response.created"),
  }),
  z.object({
    response: responseSchema,
    ...numbered,
    type: z.literal("response.in_progress"),
  }),
  z.object({
    item: outputItemSchema,
    ...itemFields,
    type: z.literal("response.output_item.added"),
  }),
  z.object({
    part: outputTextSchema,
    ...partFields,
    type: z.literal("response.content_part.added"),
  }),
  z.object({
    delta: z.string(),
    ...partFields,
    type: z.literal("response.output_text.delta"),
  }),
  z.object({
    text: z.string(),
    ...partFields,
    type: z.literal("response.output_text.done"),
  }),
  z.object({
    part: outputTextSchema,
    ...partFields,
    type: z.literal("response.content_part.done"),
  }),
  z.object({
    delta: z.string(),
    item_id: z.string(),
    ...itemFields,
    type: z.literal("response.function_call_arguments.delta"),
  }),
  z.object({
    arguments: z.string(),
    item_id: z.string(),
    ...itemFields,
    type: z.literal("response.function_call_arguments.done"),
  }),
  z.object({
    item: outputItemSchema,
    ...itemFields,
    type: z.literal("response.output_item.done"),
  }),
  z.object({
    response: responseSchema,
    ...numbered,
    type: z.literal("response.completed"),
  }),
]);

type OutputText = z.infer<typeof outputTextSchema>;
type MessageItem = z.infer<typeof messageItemSchema>;
type FunctionCallItem = z.infer<typeof functionCallItemSchema>;
type OutputItem = z.infer<typeof outputItemSchema>;
type ModelResponse = z.infer<typeof responseSchema>;
type ResponseStreamEvent = z.infer<typeof responseStreamEventSchema>;
type Usage = z.infer<typeof usageSchema>;

const PROTOCOL = "openai-responses";
const RESPONSE_ID_LENGTH = 24;
const ITEM_ID_LENGTH = 24;

const ONLY_CONTENT_PART = 0;

const INCOMPLETE_REASONS = new Map([
  ["content-filter", "content_filter"],
  ["length", "max_output_tokens"],
]);

interface Finish {
  readonly reason: string | undefined;
  readonly status: string;
}

const finishOf = (finishReason: string): Finish => {
  const reason = INCOMPLETE_REASONS.get(finishReason);
  return { reason, status: reason === undefined ? "completed" : "incomplete" };
};

const usage = (
  inputTokens: number,
  outputTokens: number,
  credits: CreditUsage | undefined
): Usage => ({
  credits,
  input_tokens: inputTokens,
  output_tokens: outputTokens,
  total_tokens: inputTokens + outputTokens,
});

const messageId = (): string => `msg_${randomHex(ITEM_ID_LENGTH)}`;

const outputText = (text: string): OutputText => ({
  annotations: [],
  text,
  type: "output_text",
});

type ItemStatus = "in_progress" | "completed";

const messageItem = (
  id: string,
  text: string,
  status: ItemStatus
): MessageItem => ({
  content: status === "completed" ? [outputText(text)] : [],
  id,
  role: "assistant",
  status,
  type: "message",
});

const functionCallItem = (
  call: ToolCall,
  status: ItemStatus
): FunctionCallItem => ({
  arguments: status === "completed" ? JSON.stringify(call.input) : "",
  call_id: `call_${call.id}`,
  id: `fc_${call.id}`,
  name: call.name,
  status,
  type: "function_call",
});

interface Snapshot {
  readonly created: number;
  readonly id: string;
  readonly model: string;
  readonly output: readonly OutputItem[];
  readonly reason?: string;
  readonly status: string;
  readonly usage?: Usage;
}

const modelResponse = (snapshot: Snapshot): ModelResponse => ({
  created_at: snapshot.created,
  error: null,
  id: snapshot.id,
  incomplete_details:
    snapshot.reason === undefined ? null : { reason: snapshot.reason },
  model: snapshot.model,
  object: "response",
  output: [...snapshot.output],
  parallel_tool_calls: true,
  status: snapshot.status,
  usage: snapshot.usage,
});

const frame = (event: ResponseStreamEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const streamWire = (
  id: string,
  model: string,
  created: number,
  inputTokens: number
): StreamWire => {
  const output: OutputItem[] = [];
  let sequence = 0;
  let index = -1;
  let textId = "";
  let text = "";
  let textOpen = false;

  const seq = (): number => {
    const current = sequence;
    sequence += 1;
    return current;
  };

  const response = (
    type: "response.created" | "response.in_progress" | "response.completed",
    status: string,
    reason?: string,
    spent?: Usage
  ): string =>
    frame({
      response: modelResponse({
        created,
        id,
        model,
        output,
        reason,
        status,
        usage: spent,
      }),
      sequence_number: seq(),
      type,
    });

  const openText = (): string => {
    if (textOpen) {
      return "";
    }
    textOpen = true;
    index += 1;
    textId = messageId();
    text = "";
    return (
      frame({
        item: messageItem(textId, "", "in_progress"),
        output_index: index,
        sequence_number: seq(),
        type: "response.output_item.added",
      }) +
      frame({
        content_index: ONLY_CONTENT_PART,
        item_id: textId,
        output_index: index,
        part: outputText(""),
        sequence_number: seq(),
        type: "response.content_part.added",
      })
    );
  };

  const closeText = (): string => {
    if (!textOpen) {
      return "";
    }
    textOpen = false;
    const item = messageItem(textId, text, "completed");
    output.push(item);
    return (
      frame({
        content_index: ONLY_CONTENT_PART,
        item_id: textId,
        output_index: index,
        sequence_number: seq(),
        text,
        type: "response.output_text.done",
      }) +
      frame({
        content_index: ONLY_CONTENT_PART,
        item_id: textId,
        output_index: index,
        part: outputText(text),
        sequence_number: seq(),
        type: "response.content_part.done",
      }) +
      frame({
        item,
        output_index: index,
        sequence_number: seq(),
        type: "response.output_item.done",
      })
    );
  };

  return {
    call: (call) => {
      const closed = closeText();
      index += 1;
      const item = functionCallItem(call, "completed");
      output.push(item);
      return (
        closed +
        frame({
          item: functionCallItem(call, "in_progress"),
          output_index: index,
          sequence_number: seq(),
          type: "response.output_item.added",
        }) +
        frame({
          delta: item.arguments,
          item_id: item.id,
          output_index: index,
          sequence_number: seq(),
          type: "response.function_call_arguments.delta",
        }) +
        frame({
          arguments: item.arguments,
          item_id: item.id,
          output_index: index,
          sequence_number: seq(),
          type: "response.function_call_arguments.done",
        }) +
        frame({
          item,
          output_index: index,
          sequence_number: seq(),
          type: "response.output_item.done",
        })
      );
    },
    close: (finishReason, outputTokens, credits) => {
      const closed = closeText();
      const { reason, status } = finishOf(finishReason);
      return (
        closed +
        response(
          "response.completed",
          status,
          reason,
          usage(inputTokens, outputTokens, credits)
        )
      );
    },
    open: () =>
      response("response.created", "in_progress") +
      response("response.in_progress", "in_progress"),
    text: (delta) => {
      const opened = openText();
      text += delta;
      return (
        opened +
        frame({
          content_index: ONLY_CONTENT_PART,
          delta,
          item_id: textId,
          output_index: index,
          sequence_number: seq(),
          type: "response.output_text.delta",
        })
      );
    },
  };
};

const buffered = (
  id: string,
  model: string,
  created: number,
  reply: Reply
): ModelResponse => {
  const output: OutputItem[] = [];
  if (reply.text.length > 0) {
    output.push(messageItem(messageId(), reply.text, "completed"));
  }
  output.push(
    ...reply.calls.map((call) => functionCallItem(call, "completed"))
  );
  const { reason, status } = finishOf(reply.finishReason);
  return modelResponse({
    created,
    id,
    model,
    output,
    reason,
    status,
    usage: usage(reply.inputTokens, reply.outputTokens, reply.credits),
  });
};

export const responsesWire = (model: string): Wire => {
  const id = `resp_${randomHex(RESPONSE_ID_LENGTH)}`;
  const created = createdNow();
  return {
    fail: openaiFailure,
    id,
    protocol: PROTOCOL,
    reply: (value) => Response.json(buffered(id, model, created, value)),
    stream: (inputTokens) => streamWire(id, model, created, inputTokens),
  };
};
