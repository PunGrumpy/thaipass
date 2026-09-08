import { chatModelSchema } from "@thaipass/core/aipass/models";
import { thinkingLevelSchema } from "@thaipass/core/aipass/thinking";
import type { ThinkingLevel } from "@thaipass/core/aipass/thinking";
import type { ToolDefinition } from "@thaipass/core/tools";
import type {
  ChatTurn,
  Conversation,
  TurnRole,
} from "@thaipass/core/translate";
import { z } from "zod";

import { contentOf, turnOf } from "../content";
import type { ContentPart } from "../content";
import { parseToolArguments, reasoningEffortSchema } from "../schema";

const inputImagePartSchema = z
  .object({
    image_url: z.string(),
    type: z.literal("input_image"),
  })
  .transform((part): ContentPart => ({ kind: "file", uri: part.image_url }));

const inputFilePartSchema = z
  .object({
    file_data: z.string(),
    filename: z.string().optional(),
    type: z.literal("input_file"),
  })
  .transform((part): ContentPart => ({
    filename: part.filename,
    kind: "file",
    uri: part.file_data,
  }));

const textPartSchema = z
  .object({ refusal: z.string().optional(), text: z.string().optional() })
  .transform((part): ContentPart => ({
    kind: "text",
    text: part.text ?? part.refusal ?? "",
  }));

const contentPartSchema = z.union([
  z.string().transform((text): ContentPart => ({ kind: "text", text })),
  inputImagePartSchema,
  inputFilePartSchema,
  textPartSchema,
]);

const contentSchema = contentOf(contentPartSchema);

const roleSchema = z
  .union([
    z
      .enum(["system", "developer", "user", "assistant"])
      .transform((role): TurnRole => (role === "developer" ? "system" : role)),
    z.unknown().transform((): TurnRole => "user"),
  ])
  .optional()
  .transform((value): TurnRole => value ?? "user");

type InputItem = ChatTurn | null;

const messageItemSchema = z
  .object({
    content: contentSchema,
    role: roleSchema,
    type: z.literal("message").optional(),
  })
  .transform((item): InputItem => turnOf(item.role, item.content));

const functionCallItemSchema = z
  .object({
    arguments: z.string().optional(),
    call_id: z.string(),
    name: z.string(),
    type: z.literal("function_call"),
  })
  .transform((item): InputItem => ({
    calls: [
      {
        id: item.call_id,
        input: parseToolArguments(item.arguments),
        name: item.name,
      },
    ],
    content: "",
    role: "assistant",
  }));

const callOutputSchema = z.union([
  z.string(),
  z
    .array(z.object({ text: z.string().optional() }))
    .transform((parts) => parts.map((part) => part.text ?? "").join("")),
  z.unknown().transform((value) => JSON.stringify(value) ?? ""),
]);

const functionCallOutputItemSchema = z
  .object({
    call_id: z.string(),
    output: callOutputSchema,
    type: z.literal("function_call_output"),
  })
  .transform((item): InputItem => ({
    callId: item.call_id,
    content: item.output,
    role: "tool",
  }));

const inputItemSchema = z.union([
  functionCallItemSchema,
  functionCallOutputItemSchema,
  messageItemSchema,
  z.unknown().transform((): InputItem => null),
]);

const inputSchema = z
  .union([
    z
      .string()
      .transform((text): InputItem[] => [{ content: text, role: "user" }]),
    z.array(inputItemSchema),
    z.unknown().transform((): InputItem[] => []),
  ])
  .optional()
  .transform((value): InputItem[] => value ?? []);

const toolSchema = z.union([
  z
    .object({
      description: z.string().optional(),
      name: z.string(),
      parameters: z.unknown().optional(),
      type: z.literal("function"),
    })
    .transform((tool): ToolDefinition | null => ({
      description: tool.description,
      inputSchema: tool.parameters,
      name: tool.name,
    })),
  z.unknown().transform((): ToolDefinition | null => null),
]);

export const responsesRequestSchema = z.object({
  input: inputSchema,
  instructions: z.string().nullish(),
  model: chatModelSchema.optional(),
  previous_response_id: z.string().nullish(),
  reasoning: z.object({ effort: reasoningEffortSchema.nullish() }).nullish(),
  stream: z.boolean().optional(),
  thinking_level: thinkingLevelSchema.optional(),
  tools: z.array(toolSchema).optional(),
});

export type ResponsesRequest = z.infer<typeof responsesRequestSchema>;

export const toThinking = (body: ResponsesRequest): ThinkingLevel | undefined =>
  body.thinking_level ?? body.reasoning?.effort ?? undefined;

export const toConversation = (body: ResponsesRequest): Conversation => {
  const instructions = body.instructions ?? "";
  const turns: ChatTurn[] =
    instructions.length > 0 ? [{ content: instructions, role: "system" }] : [];
  turns.push(...body.input.filter((item) => item !== null));
  return {
    tools: (body.tools ?? []).filter((tool) => tool !== null),
    turns,
  };
};
