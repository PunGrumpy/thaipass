import { z } from "zod";

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

const skippedTypeSchema = z.object({ type: z.string() });

export interface SSESkips {
  count: number;
  readonly types: Set<string>;
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
          const named = skippedTypeSchema.safeParse(raw);
          if (named.success) {
            skips.types.add(named.data.type);
          }
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
