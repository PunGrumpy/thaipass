import { z } from "zod";

import { chatModelSchema } from "../aipass/models";
import { toolInputSchema } from "../tools";
import type { ToolDefinition, ToolInput } from "../tools";
import type { ChatTurn, Conversation } from "../translate";

const textBlockSchema = z
  .object({ text: z.string(), type: z.literal("text") })
  .transform((block) => block.text);

/** Text blocks joined, anything else (images, documents) dropped. */
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
      readonly kind: "call";
      readonly id: string;
      readonly name: string;
      readonly input: ToolInput;
    }
  | { readonly kind: "result"; readonly callId: string; readonly text: string }
  | { readonly kind: "skip" };

const blockSchema = z.union([
  textBlockSchema.transform((text): Block => ({ kind: "text", text })),
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

const roleSchema = z.enum(["user", "assistant"]);

type Role = z.infer<typeof roleSchema>;

/**
 * An Anthropic message can hold several things at once: a user turn carries
 * the results of the calls the assistant made, then the user's own words. Each
 * becomes its own turn so the flattened prompt keeps them apart.
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
  if (calls.length > 0 && role === "assistant") {
    turns.push({ calls, content: text, role });
  } else if (text.length > 0 || turns.length === 0) {
    turns.push({ content: text, role });
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

export const messagesRequestSchema = z.object({
  max_tokens: z.number().int().optional(),
  messages: z.array(messageSchema).optional(),
  model: chatModelSchema.optional(),
  stream: z.boolean().optional(),
  system: textOnlySchema,
  tools: z.array(toolSchema).optional(),
});

export type MessagesRequest = z.infer<typeof messagesRequestSchema>;

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
