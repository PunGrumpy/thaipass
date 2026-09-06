import { chatModelSchema } from "@thaipass/core/aipass/models";
import { thinkingLevelSchema } from "@thaipass/core/aipass/thinking";
import type { ThinkingLevel } from "@thaipass/core/aipass/thinking";
import { toolInputSchema } from "@thaipass/core/tools";
import type { ToolCall, ToolDefinition, ToolInput } from "@thaipass/core/tools";
import type {
  ChatTurn,
  Conversation,
  TurnRole,
} from "@thaipass/core/translate";
import { z } from "zod";

/** Files are collected rather than flattened: they go to the bucket, only text joins the prompt. */
type ContentPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "file"; readonly uri: string; readonly filename?: string };

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

const contentSchema = z
  .union([
    z.string().transform((text): ContentPart[] => [{ kind: "text", text }]),
    z.array(contentPartSchema),
    z.unknown().transform((): ContentPart[] => []),
  ])
  .optional()
  .transform((value): ContentPart[] => value ?? []);

const textOf = (parts: readonly ContentPart[]): string =>
  parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("");

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
    const files = message.content
      .filter((part) => part.kind === "file")
      .map((part) => ({ filename: part.filename, uri: part.uri }));
    const turn: ChatTurn =
      files.length > 0
        ? { content: textOf(message.content), files, role: message.role }
        : { content: textOf(message.content), role: message.role };
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

/** `minimal` rounds to `low`; the other values line up with the AI Pass levels. */
const reasoningEffortSchema = z
  .enum(["minimal", "low", "medium", "high"])
  .transform((effort): ThinkingLevel =>
    effort === "minimal" ? "low" : effort
  );

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
