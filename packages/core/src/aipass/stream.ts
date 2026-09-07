import { parseJsonEventStream } from "@ai-sdk/provider-utils";
import { z } from "zod";

import { fileEventSchema } from "./media";
import type { FileEvent } from "./media";

/** The composer reads `url` and the web client sends `storageKey`; both carry the same key. */
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

/** Some models put the file's fields at the top level, others under `data`; the outer wins. */
const fileFrameSchema = fileEventSchema.extend({
  data: fileEventSchema.optional(),
  type: z.literal("file"),
});

const toolErrorSchema = <Type extends string>(type: Type) =>
  z.object({
    errorText: optionalText,
    toolName: optionalText,
    type: z.literal(type),
  });

const upstreamEventSchema = z.discriminatedUnion("type", [
  z.object({ delta: z.string(), type: z.literal("text-delta") }),
  z.object({ delta: z.string(), type: z.literal("reasoning-delta") }),
  fileFrameSchema,
  z.object({ finishReason: optionalText, type: z.literal("finish") }),
  toolErrorSchema("tool-input-error"),
  toolErrorSchema("tool-output-error"),
  z.object({
    error: optionalText,
    errorText: optionalText,
    type: z.literal("error"),
  }),
]);

const toFileEvent = (frame: z.infer<typeof fileFrameSchema>): FileEvent => {
  const { data } = frame;
  return {
    filename: frame.filename ?? data?.filename,
    mediaType: frame.mediaType ?? data?.mediaType,
    snapshotUrl: frame.snapshotUrl ?? data?.snapshotUrl,
    url: frame.url ?? data?.url,
  };
};

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
        yield { file: toFileEvent(event), kind: "file" };
        break;
      }
      case "finish": {
        yield { kind: "finish", reason: event.finishReason ?? "stop" };
        break;
      }
      // The tool named is one of the caller's. The model behind AI Pass reads
      // the tool guide out of the prompt and sometimes calls it natively, and
      // AI Pass has no such tool to run, so the attempt errors.
      case "tool-input-error":
      case "tool-output-error": {
        const tool = event.toolName ?? "a tool";
        const detail = event.errorText ?? "no detail";
        yield {
          kind: "error",
          message: `upstream failed on ${tool}: ${detail}`,
        };
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
