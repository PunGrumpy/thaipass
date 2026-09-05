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
 * The two halves of an AI Pass exchange that every caller shares.
 *
 * Before the turn goes out, `prepareTurn` flattens the conversation, decodes
 * its files and checks the reasoning level against the catalog. Once the reply
 * starts, `readReply` turns the stream into text, tool calls, reasoning and
 * files. The HTTP routes, the AI SDK provider and the media endpoints all do
 * both and differ only in how they render what comes out, so how a reply is
 * read lives here once.
 */

export interface PreparedTurn {
  readonly prompt: string;
  readonly inputTokens: number;
  readonly sendOptions: SendOptions;
  readonly thinkingLevel: ThinkingLevel | null;
  /** Why the asked-for level was dropped, when it was. */
  readonly thinkingDropped?: string;
}

/**
 * Only a request that asked for a level reads the catalog: on a cold cache
 * that is a round trip, and a caller who never mentioned thinking should not
 * pay for it. A file that cannot be decoded throws an `InlineError`.
 */
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
  | { readonly kind: "error"; readonly message: string };

/** What one reply amounted to, for the wide event and the usage figures. */
export interface ReplyTally {
  calls: number;
  chars: number;
  deltas: number;
  files: number;
  /** As upstream reported it, `stop` until it says otherwise. */
  finishReason: string;
  msToFirstChunk: number | undefined;
  reasoningChars: number;
  /** The text the model wrote, tool calls included, for the token estimate. */
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
  /** When the request began, for the time to the first chunk. */
  readonly startedAt?: number;
}

/** A reply with calls finished on tool calls unless upstream said otherwise. */
export const finishReasonOf = (tally: ReplyTally): string =>
  tally.calls > 0 && tally.finishReason === "stop"
    ? "tool-calls"
    : tally.finishReason;

export const replyTokens = (tally: ReplyTally): number =>
  charTokens(tally.reply);

/**
 * Reads one reply. Text goes through the tool-call splitter, so a fenced call
 * comes out as a `call` event and never as text. The reader fetches a generated
 * file and yields it as an asset for the caller to render. It yields an
 * upstream error too, since what to do about one differs per caller.
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
        yield { kind: "error", message: event.message };
      }
    }
    yield* fromParts(splitter.flush());
  };
  return { events: events(), tally };
};
