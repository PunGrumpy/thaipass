import type { Catalog } from "./aipass/catalog";
import type { SendOptions } from "./aipass/client";
import { fromDataUri } from "./aipass/inline";
import { resolveAsset } from "./aipass/media";
import type { MediaAsset } from "./aipass/media";
import { parseAipassSSE } from "./aipass/stream";
import type { SSESkips } from "./aipass/stream";
import { resolveThinking } from "./aipass/thinking";
import type { ThinkingLevel } from "./aipass/thinking";
import { addText, charTokens, estimateTokens, newCharCount } from "./tokens";
import type { CharCount } from "./tokens";
import { renderCall, splitReply } from "./tools";
import type { ReplyPart, ToolCall, ToolDefinition } from "./tools";
import { filesOf, flattenPrompt } from "./translate";
import type { Conversation } from "./translate";

/**
 * The two halves of an AI Pass exchange every caller shares: `prepareTurn`
 * before the send and `readReply` after it. The HTTP routes, the AI SDK
 * provider and the media endpoints differ only in how they render the events.
 */

export interface PreparedTurn {
  readonly prompt: string;
  readonly inputTokens: number;
  readonly sendOptions: SendOptions;
  readonly thinkingLevel: ThinkingLevel | null;
  readonly thinkingDropped?: string;
}

/** Only a request that asked for a level reads the catalog; on a cold cache that is a round trip. */
export const prepareTurn = async (
  conversation: Conversation,
  model: string,
  thinking: ThinkingLevel | undefined,
  catalog: () => Promise<Catalog | null>
): Promise<PreparedTurn> => {
  const prompt = flattenPrompt(conversation);
  const inputTokens = estimateTokens(prompt);

  let thinkingLevel: ThinkingLevel | null = null;
  let thinkingDropped: string | undefined;
  if (thinking !== undefined) {
    const entries = await catalog();
    const resolved = resolveThinking(thinking, entries?.get(model));
    thinkingLevel = resolved.level;
    thinkingDropped = resolved.dropped;
  }

  const attachments = filesOf(conversation).map((file, index) =>
    fromDataUri(file.uri, file.filename, index)
  );
  const sendOptions: SendOptions = { attachments };
  if (thinkingLevel) {
    sendOptions.thinkingLevel = thinkingLevel;
  }
  return { inputTokens, prompt, sendOptions, thinkingDropped, thinkingLevel };
};

export type ReplyEvent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "call"; readonly call: ToolCall }
  | { readonly kind: "reasoning"; readonly text: string }
  | { readonly kind: "file"; readonly asset: MediaAsset }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly tool?: string;
    };

export interface ReplyTally {
  calls: number;
  chars: number;
  deltas: number;
  files: number;
  finishReason: string;
  msToFirstChunk: number | undefined;
  reasoningChars: number;
  readonly reply: CharCount;
  readonly skips: SSESkips;
}

export interface ReplyReader {
  readonly events: AsyncIterable<ReplyEvent>;
  readonly tally: ReplyTally;
}

export interface ReadReplyOptions {
  readonly body: ReadableStream<Uint8Array>;
  readonly cookie: string;
  readonly signal: AbortSignal | undefined;
  readonly tools: readonly ToolDefinition[];
  readonly startedAt?: number;
}

/** Upstream promised a call and made none, so what it left is an apology. */
export const isAbandonedToolCall = (tally: ReplyTally): boolean =>
  tally.finishReason === "tool-calls" && tally.calls === 0;

export const finishReasonOf = (tally: ReplyTally): string => {
  if (isAbandonedToolCall(tally)) {
    return "error";
  }
  return tally.calls > 0 && tally.finishReason === "stop"
    ? "tool-calls"
    : tally.finishReason;
};

export const replyTokens = (tally: ReplyTally): number =>
  charTokens(tally.reply);

/**
 * Text goes through the tool-call splitter, so a fenced call never reaches the
 * caller as text. An upstream error is yielded rather than thrown, since each
 * caller handles one differently.
 */
export const readReply = (options: ReadReplyOptions): ReplyReader => {
  const { body, cookie, signal, tools } = options;
  const startedAt = options.startedAt ?? Date.now();
  const tally: ReplyTally = {
    calls: 0,
    chars: 0,
    deltas: 0,
    files: 0,
    finishReason: "stop",
    msToFirstChunk: undefined,
    reasoningChars: 0,
    reply: newCharCount(),
    skips: { count: 0, types: new Set() },
  };
  const splitter = splitReply(tools);

  const fromParts = function* fromParts(
    parts: readonly ReplyPart[]
  ): Generator<ReplyEvent> {
    for (const part of parts) {
      if (part.type === "text") {
        tally.chars += part.text.length;
        addText(tally.reply, part.text);
        yield { kind: "text", text: part.text };
      } else {
        tally.calls += 1;
        addText(tally.reply, renderCall(part.call));
        yield { call: part.call, kind: "call" };
      }
    }
  };

  const events = async function* events(): AsyncGenerator<ReplyEvent> {
    for await (const event of parseAipassSSE(body, tally.skips)) {
      if (event.kind === "delta") {
        tally.msToFirstChunk ??= Date.now() - startedAt;
        tally.deltas += 1;
        yield* fromParts(splitter.push(event.text));
      } else if (event.kind === "reasoning") {
        tally.reasoningChars += event.text.length;
        yield { kind: "reasoning", text: event.text };
      } else if (event.kind === "file") {
        const asset = await resolveAsset(cookie, event.file, signal);
        if (asset) {
          tally.files += 1;
          yield { asset, kind: "file" };
        }
      } else if (event.kind === "finish") {
        tally.finishReason = event.reason;
      } else {
        yield event;
      }
    }
    yield* fromParts(splitter.flush());
  };
  return { events: events(), tally };
};
