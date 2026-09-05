import { z } from "zod";

import { chatModelSchema } from "../aipass/models";
import { levelForBudget, thinkingLevelSchema } from "../aipass/thinking";
import type { ThinkingLevel } from "../aipass/thinking";
import { toolInputSchema } from "../tools";
import type { ToolDefinition, ToolInput } from "../tools";
import type { ChatTurn, Conversation } from "../translate";

const textBlockSchema = z
  .object({ text: z.string(), type: z.literal("text") })
  .transform((block) => block.text);

/** System text blocks joined; other block types dropped. */
const textOnlySchema = z
  .union([
    z.string(),
    z
      .array(
        z.union([textBlockSchema, z.unknown().transform((): string => "")])
      )
      .transform((parts) => parts.join("")),
    z.unknown().transform((): string => ""),
  ])
  .optional()
  .transform((value): string => value ?? "");

type Block =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "file";
      readonly uri: string;
      readonly filename?: string;
    }
  | {
      readonly kind: "call";
      readonly id: string;
      readonly name: string;
      readonly input: ToolInput;
    }
  | { readonly kind: "result"; readonly callId: string; readonly text: string }
  | { readonly kind: "skip" };

/**
 * A base64 source becomes a data URI so every protocol's files decode in one
 * place. A `url` source is passed through to fail there with the reason.
 */
const sourceSchema = z.union([
  z
    .object({
      data: z.string(),
      /** Anthropic requires it; a caller that omits it should still be carried. */
      media_type: z.string().default("application/octet-stream"),
      type: z.literal("base64"),
    })
    .transform((source) => `data:${source.media_type};base64,${source.data}`),
  z
    .object({ type: z.literal("url"), url: z.string() })
    .transform((source) => source.url),
]);

const fileBlockSchema = z
  .object({
    source: sourceSchema,
    title: z.string().optional(),
    type: z.enum(["image", "document"]),
  })
  .transform((block): Block => ({
    filename: block.title,
    kind: "file",
    uri: block.source,
  }));

const blockSchema = z.union([
  textBlockSchema.transform((text): Block => ({ kind: "text", text })),
  fileBlockSchema,
  z
    .object({
      id: z.string(),
      input: toolInputSchema.default({}),
      name: z.string(),
      type: z.literal("tool_use"),
    })
    .transform((block): Block => ({
      id: block.id,
      input: block.input,
      kind: "call",
      name: block.name,
    })),
  z
    .object({
      content: textOnlySchema,
      tool_use_id: z.string(),
      type: z.literal("tool_result"),
    })
    .transform((block): Block => ({
      callId: block.tool_use_id,
      kind: "result",
      text: block.content,
    })),
  z.unknown().transform((): Block => ({ kind: "skip" })),
]);

const roleSchema = z.enum(["user", "assistant", "system"]);

type Role = z.infer<typeof roleSchema>;

/**
 * A user message can carry tool results and the user's own words at once;
 * each becomes its own turn so the flattened prompt keeps them apart.
 */
const toTurns = (role: Role, blocks: readonly Block[]): ChatTurn[] => {
  const text = blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("");
  const turns: ChatTurn[] = blocks
    .filter((block) => block.kind === "result")
    .map((block) => ({
      callId: block.callId,
      content: block.text,
      role: "tool",
    }));
  const calls = blocks
    .filter((block) => block.kind === "call")
    .map(({ id, input, name }) => ({ id, input, name }));
  const files = blocks
    .filter((block) => block.kind === "file")
    .map(({ filename, uri }) => ({ filename, uri }));
  const attached = files.length > 0 ? { files } : {};
  if (calls.length > 0 && role === "assistant") {
    turns.push({ calls, content: text, role, ...attached });
  } else if (text.length > 0 || files.length > 0 || turns.length === 0) {
    turns.push({ content: text, role, ...attached });
  }
  return turns;
};

const contentSchema = z.union([
  z.string().transform((text): Block[] => [{ kind: "text", text }]),
  z.array(blockSchema),
]);

const messageSchema = z
  .object({ content: contentSchema, role: roleSchema })
  .transform((message): ChatTurn[] => toTurns(message.role, message.content));

const toolSchema = z
  .object({
    description: z.string().optional(),
    input_schema: z.unknown().optional(),
    name: z.string(),
  })
  .transform((tool): ToolDefinition => ({
    description: tool.description,
    inputSchema: tool.input_schema,
    name: tool.name,
  }));

/** `enabled` picks a level from `budget_tokens`; `adaptive` takes `output_config.effort`. */
const thinkingBlockSchema = z.object({
  budget_tokens: z.number().int().optional(),
  type: z.enum(["adaptive", "disabled", "enabled"]),
});

/** `xhigh` rounds down to `high`; the other values line up with the AI Pass levels. */
const effortSchema = z
  .enum(["low", "medium", "high", "xhigh", "max"])
  .transform((effort): ThinkingLevel => (effort === "xhigh" ? "high" : effort));

const outputConfigSchema = z.object({ effort: effortSchema.optional() });

export const messagesRequestSchema = z.object({
  max_tokens: z.number().int().optional(),
  messages: z.array(messageSchema).optional(),
  model: chatModelSchema.optional(),
  output_config: outputConfigSchema.optional(),
  stream: z.boolean().optional(),
  system: textOnlySchema,
  thinking: thinkingBlockSchema.optional(),
  thinking_level: thinkingLevelSchema.optional(),
  tools: z.array(toolSchema).optional(),
});

export type MessagesRequest = z.infer<typeof messagesRequestSchema>;

export const toThinking = (
  body: MessagesRequest
): ThinkingLevel | undefined => {
  if (body.thinking_level) {
    return body.thinking_level;
  }
  const type = body.thinking?.type;
  if (type === undefined || type === "disabled") {
    return undefined;
  }
  const effort = body.output_config?.effort;
  if (effort !== undefined) {
    return effort;
  }
  const budget = body.thinking?.budget_tokens;
  return budget === undefined ? "medium" : levelForBudget(budget);
};

export const toConversation = (body: MessagesRequest): Conversation => {
  const turns: ChatTurn[] = [];
  if (body.system.length > 0) {
    turns.push({ content: body.system, role: "system" });
  }
  for (const message of body.messages ?? []) {
    turns.push(...message);
  }
  return { tools: body.tools ?? [], turns };
};
