import { chatModelSchema } from "@thaipass/core/aipass/models";
import { thinkingLevelSchema } from "@thaipass/core/aipass/thinking";
import type { ThinkingLevel } from "@thaipass/core/aipass/thinking";
import { toolInputSchema } from "@thaipass/core/tools";
import type { ToolCall, ToolDefinition, ToolInput } from "@thaipass/core/tools";
import type { Conversation, TurnRole } from "@thaipass/core/translate";
import { z } from "zod";

import { contentOf, turnOf } from "./content";
import type { ContentPart } from "./content";

const imageUrlPartSchema = z
  .object({
    image_url: z.object({ url: z.string() }),
    type: z.literal("image_url"),
  })
  .transform((part): ContentPart => ({
    kind: "file",
    uri: part.image_url.url,
  }));

const filePartSchema = z
  .object({
    file: z.object({
      file_data: z.string(),
      filename: z.string().optional(),
    }),
    type: z.literal("file"),
  })
  .transform((part): ContentPart => ({
    filename: part.file.filename,
    kind: "file",
    uri: part.file.file_data,
  }));

const contentPartSchema = z.union([
  z.string().transform((text): ContentPart => ({ kind: "text", text })),
  imageUrlPartSchema,
  filePartSchema,
  z.object({ text: z.string().optional() }).transform((part): ContentPart => ({
    kind: "text",
    text: part.text ?? "",
  })),
]);

const contentSchema = contentOf(contentPartSchema);

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
  .transform((message) => {
    const turn = turnOf(message.role, message.content);
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

/** `none` asks for no thinking; `minimal` rounds to `low` and `xhigh` to `max`. */
const EFFORT_LEVELS = {
  high: "high",
  low: "low",
  medium: "medium",
  minimal: "low",
  none: undefined,
  xhigh: "max",
} as const satisfies Record<string, ThinkingLevel | undefined>;

export const reasoningEffortSchema = z
  .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
  .transform((effort): ThinkingLevel | undefined => EFFORT_LEVELS[effort]);

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).optional(),
  model: chatModelSchema.optional(),
  reasoning_effort: reasoningEffortSchema.optional(),
  stream: z.boolean().optional(),
  thinking_level: thinkingLevelSchema.optional(),
  tools: z.array(toolSchema).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const toThinking = (body: ChatRequest): ThinkingLevel | undefined =>
  body.thinking_level ?? body.reasoning_effort;

export const toConversation = (body: ChatRequest): Conversation => ({
  tools: body.tools ?? [],
  turns: body.messages ?? [],
});
