import { parseJsonEventStream } from "@ai-sdk/provider-utils";
import { z } from "zod";

import { fileEventSchema } from "./media";
import type { FileEvent } from "./media";

/**
 * A file part addresses an object already in the bucket. The upstream composer
 * reads `url` and the web client sends `storageKey` beside it, so both carry
 * the same key rather than one being derived from the other.
 */
export type AipassPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "file";
      readonly mediaType: string;
      readonly filename: string;
      readonly url: string;
      readonly storageKey: string;
    };

export interface AipassMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly metadata: { readonly modelId: string };
  readonly parts: readonly AipassPart[];
}

export type StreamEvent =
  | { readonly kind: "delta"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | { readonly kind: "file"; readonly file: FileEvent }
  | { readonly kind: "finish"; readonly reason: string }
  | { readonly kind: "error"; readonly message: string };

const optionalText = z
  .union([
    z.string(),
    z.unknown().transform((): string | undefined => undefined),
  ])
  .optional();

/**
 * A generated file arrives with its fields at the top level on some models and
 * nested under `data` on others, so both are read and the outer one wins.
 */
const fileFrameSchema = fileEventSchema.extend({
  data: fileEventSchema.optional(),
  type: z.literal("file"),
});

const upstreamEventSchema = z.discriminatedUnion("type", [
  z.object({ delta: z.string(), type: z.literal("text-delta") }),
  z.object({ delta: z.string(), type: z.literal("reasoning-delta") }),
  fileFrameSchema,
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
      case "file": {
        const { data } = event;
        yield {
          file: {
            filename: event.filename ?? data?.filename,
            mediaType: event.mediaType ?? data?.mediaType,
            snapshotUrl: event.snapshotUrl ?? data?.snapshotUrl,
            url: event.url ?? data?.url,
          },
          kind: "file",
        };
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
