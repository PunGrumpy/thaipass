import { z } from "zod";

export type OpenAIRole = "system" | "user" | "assistant" | "tool";

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

    z.unknown().transform((): OpenAIRole => "user"),
  ])
  .optional()
  .transform((value): OpenAIRole => value ?? "user");

const messageSchema = z.object({
  content: contentSchema,
  role: roleSchema,
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
});

export type OpenAIMessage = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface AipassMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly metadata: { readonly modelId: string };
  readonly parts: readonly { readonly type: "text"; readonly text: string }[];
}

export type StreamEvent =
  | { readonly kind: "delta"; readonly text: string }
  | { readonly kind: "finish"; readonly reason: string }
  | { readonly kind: "error"; readonly message: string };

const optionalText = z
  .union([
    z.string(),
    z.unknown().transform((): string | undefined => undefined),
  ])
  .optional();

const upstreamEventSchema = z.discriminatedUnion("type", [
  z.object({ delta: z.string(), type: z.literal("text-delta") }),
  z.object({ finishReason: optionalText, type: z.literal("finish") }),
  z.object({
    error: optionalText,
    errorText: optionalText,
    type: z.literal("error"),
  }),
]);

const roleLabel = (role: OpenAIRole): string => {
  if (role === "assistant") {
    return "Assistant";
  }
  if (role === "tool") {
    return "Tool";
  }
  return "User";
};

export const flattenConversation = (
  messages: readonly OpenAIMessage[]
): string => {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .filter((text) => text.length > 0)
    .join("\n\n");
  const convo = messages.filter((m) => m.role !== "system");

  if (system.length === 0 && convo.length === 1 && convo[0]?.role === "user") {
    return convo[0].content;
  }

  const blocks: string[] = [];
  if (system.length > 0) {
    blocks.push(system.trim());
  }
  const lines: string[] = [];
  for (const message of convo) {
    const text = message.content.trim();
    if (text.length === 0) {
      continue;
    }
    lines.push(`${roleLabel(message.role)}: ${text}`);
  }
  if (lines.length > 0) {
    blocks.push(lines.join("\n\n"));
  }
  return blocks.join("\n\n");
};

export const toAipassMessages = (
  messages: readonly OpenAIMessage[],
  modelId: string
): AipassMessage[] => [
  {
    id: crypto.randomUUID(),
    metadata: { modelId },
    parts: [{ text: flattenConversation(messages), type: "text" }],
    role: "user",
  },
];

export interface SSESkips {
  count: number;
}

export const parseAipassSSE = async function* parseAipassSSE(
  body: ReadableStream<Uint8Array>,
  skips?: SSESkips
): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const value of body) {
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/u, "");
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) {
        continue;
      }
      const payload = line.slice(5).trim();
      if (payload.length === 0) {
        continue;
      }
      if (payload === "[DONE]") {
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(payload);
      } catch {
        if (skips) {
          skips.count += 1;
        }
        continue;
      }
      const decoded = upstreamEventSchema.safeParse(raw);
      if (!decoded.success) {
        if (skips) {
          skips.count += 1;
        }
        continue;
      }
      const event = decoded.data;
      switch (event.type) {
        case "text-delta": {
          yield { kind: "delta", text: event.delta };
          break;
        }
        case "finish": {
          yield { kind: "finish", reason: event.finishReason ?? "stop" };
          break;
        }
        default: {
          yield {
            kind: "error",
            message: event.errorText ?? event.error ?? "upstream error",
          };
        }
      }
    }
  }
};

export interface ChatDelta {
  role?: "assistant";
  content?: string;
}

export interface ChatCompletionChunk {
  readonly choices: readonly {
    readonly delta: ChatDelta;
    readonly finish_reason: string | null;
    readonly index: number;
  }[];
  readonly created: number;
  readonly id: string;
  readonly model: string;
  readonly object: "chat.completion.chunk";
}

export interface ChatCompletion {
  readonly choices: readonly {
    readonly finish_reason: string;
    readonly index: number;
    readonly message: { readonly content: string; readonly role: "assistant" };
  }[];
  readonly created: number;
  readonly id: string;
  readonly model: string;
  readonly object: "chat.completion";
  readonly usage: {
    readonly completion_tokens: number;
    readonly prompt_tokens: number;
    readonly total_tokens: number;
  };
}

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
