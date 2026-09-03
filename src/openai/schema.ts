import { z } from "zod";

import { chatModelSchema } from "../aipass/models";
import { toolInputSchema } from "../tools";
import type { ToolCall, ToolDefinition, ToolInput } from "../tools";
import type { ChatTurn, Conversation, TurnRole } from "../translate";

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

    z.unknown().transform((): TurnRole => "user"),
  ])
  .optional()
  .transform((value): TurnRole => value ?? "user");

/** OpenAI sends arguments as a JSON string; anything unreadable becomes no arguments. */
const parseArguments = (raw: string | undefined): ToolInput => {
  if (raw === undefined || raw.length === 0) {
    return {};
  }
  try {
    const parsed = toolInputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

const toolCallSchema = z
  .object({
    function: z.object({ arguments: z.string().optional(), name: z.string() }),
    id: z.string(),
  })
  .transform((call): ToolCall => ({
    id: call.id,
    input: parseArguments(call.function.arguments),
    name: call.function.name,
  }));

const messageSchema = z
  .object({
    content: contentSchema,
    role: roleSchema,
    tool_call_id: z.string().optional(),
    tool_calls: z.array(toolCallSchema).optional(),
  })
  .transform((message): ChatTurn => {
    const turn: ChatTurn = { content: message.content, role: message.role };
    if (message.tool_calls && message.tool_calls.length > 0) {
      return { ...turn, calls: message.tool_calls };
    }
    if (message.tool_call_id !== undefined) {
      return { ...turn, callId: message.tool_call_id };
    }
    return turn;
  });

const toolSchema = z
  .object({
    function: z.object({
      description: z.string().optional(),
      name: z.string(),
      parameters: z.unknown().optional(),
    }),
    type: z.literal("function"),
  })
  .transform((tool): ToolDefinition => ({
    description: tool.function.description,
    inputSchema: tool.function.parameters,
    name: tool.function.name,
  }));

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).optional(),
  model: chatModelSchema.optional(),
  stream: z.boolean().optional(),
  tools: z.array(toolSchema).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const toConversation = (body: ChatRequest): Conversation => ({
  tools: body.tools ?? [],
  turns: body.messages ?? [],
});
