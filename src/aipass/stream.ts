import { parseJsonEventStream } from "@ai-sdk/provider-utils";
import { z } from "zod";

export interface AipassMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly metadata: { readonly modelId: string };
  readonly parts: readonly { readonly type: "text"; readonly text: string }[];
}

export type StreamEvent =
  | { readonly kind: "delta"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
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
  z.object({ delta: z.string(), type: z.literal("reasoning-delta") }),
  z.object({ finishReason: optionalText, type: z.literal("finish") }),
  z.object({
    error: optionalText,
    errorText: optionalText,
    type: z.literal("error"),
  }),
]);

const skippedTypeSchema = z.object({ type: z.string() });

export interface SSESkips {
  count: number;
  readonly types: Set<string>;
}

export const parseAipassSSE = async function* parseAipassSSE(
  body: ReadableStream<Uint8Array>,
  skips?: SSESkips
): AsyncGenerator<StreamEvent> {
  const chunks = parseJsonEventStream({
    schema: upstreamEventSchema,
    stream: body,
  });
  for await (const chunk of chunks) {
    if (!chunk.success) {
      if (skips) {
        skips.count += 1;
        const named = skippedTypeSchema.safeParse(chunk.rawValue);
        if (named.success) {
          skips.types.add(named.data.type);
        }
      }
      continue;
    }
    const event = chunk.value;
    switch (event.type) {
      case "text-delta": {
        yield { kind: "delta", text: event.delta };
        break;
      }
      case "reasoning-delta": {
        yield { kind: "reasoning", text: event.delta };
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
};
