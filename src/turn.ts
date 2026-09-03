import type { RequestLogger } from "evlog";

import { fetchCatalog } from "./aipass/catalog";
import type { Catalog } from "./aipass/catalog";
import { deleteConversation, sendMessage } from "./aipass/client";
import type { SendResult } from "./aipass/client";
import { fetchIdentity } from "./aipass/identity";
import type { Identity } from "./aipass/identity";
import type { ChatModel } from "./aipass/models";
import { fetchCredits, settleCredits } from "./aipass/quotas";
import type { CreditUsage, Credits } from "./aipass/quotas";
import { clientIdFromCookie, cookieFromRequest } from "./aipass/session";
import { parseAipassSSE } from "./aipass/stream";
import type { SSESkips } from "./aipass/stream";
import type { DeferredEmit } from "./lib/logger";
import { guardController } from "./lib/stream";
import type { GuardedController } from "./lib/stream";
import { splitReply } from "./tools";
import type { ReplyPart, ToolCall } from "./tools";
import { toAipassMessages } from "./translate";
import type { Conversation } from "./translate";

/**
 * One turn against AI Pass, rendered through a protocol's wire.
 *
 * The turn is the same whichever protocol asked for it: open a throwaway
 * conversation, send the flattened prompt, split the reply into text and tool
 * calls, delete the conversation, write one wide event. What differs is the
 * shape of the bytes going back, and that is all a `Wire` decides.
 */

export interface Failure {
  readonly status: number;
  readonly message: string;
  readonly detail?: string;
  readonly location?: string;
}

export interface Reply {
  readonly calls: readonly ToolCall[];
  readonly credits?: CreditUsage;
  readonly finishReason: string;
  readonly text: string;
}

/** Renders one streamed reply; a fresh one per response so it can hold state. */
export interface StreamWire {
  readonly open: () => string;
  readonly text: (delta: string) => string;
  readonly call: (call: ToolCall) => string;
  readonly close: (finishReason: string, credits?: CreditUsage) => string;
}

export interface Wire {
  readonly id: string;
  readonly protocol: string;
  readonly fail: (failure: Failure) => Response;
  readonly stream: () => StreamWire;
  readonly reply: (reply: Reply) => Response;
}

export interface TurnRequest {
  readonly conversation: Conversation;
  readonly deferEmit: DeferredEmit;
  readonly log: RequestLogger;
  readonly model: ChatModel;
  readonly request: Request;
  readonly stream: boolean;
  readonly wire: Wire;
}

const encoder = new TextEncoder();
const DETAIL_LIMIT = 300;
const CLIENT_CLOSED_STATUS = 499;
const TOOL_CALLS = "tool-calls";

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

const failUpstream = (
  wire: Wire,
  log: RequestLogger,
  cause: unknown,
  message: string
): Response => {
  log.set({ status: 502 });
  log.error(asError(cause));
  return wire.fail({ message, status: 502 });
};

interface UpstreamFacts {
  readonly credits: Promise<Credits | null>;
  readonly catalog: Promise<Catalog | null>;
  readonly identity: Promise<Identity | null>;
}

const recordUpstream = async (
  facts: UpstreamFacts,
  model: string,
  log: RequestLogger,
  settled: Credits | null = null
): Promise<void> => {
  const [before, catalog, identity] = await Promise.all([
    facts.credits,
    facts.catalog,
    facts.identity,
  ]);
  const credits = settled ?? before;
  if (credits) {
    log.set({ ...credits });
  }
  if (identity) {
    log.set({ ...identity });
  }
  const entry = catalog?.get(model);
  if (entry) {
    log.set({ modelFree: entry.free, modelReady: entry.ready });
  }
};

const upstreamError = async (
  wire: Wire,
  cookie: string,
  response: Response,
  conversationId: string,
  log: RequestLogger
): Promise<Response> => {
  const contentType = response.headers.get("content-type") ?? "";
  const location = response.headers.get("location");
  const detail = response.body ? await response.text().catch(() => "") : "";
  await deleteConversation(cookie, conversationId);
  const staleCookie =
    response.status >= 300 &&
    response.status < 400 &&
    (location ?? "").includes("sign-in");
  const hint = staleCookie ? "; cookie is stale, re-auth needed" : "";
  log.set({
    staleCookie,
    status: 502,
    upstreamContentType: contentType,
    upstreamStatus: response.status,
  });
  log.error(new Error(`upstream ${response.status}${hint}`));
  return wire.fail({
    detail: detail.slice(0, DETAIL_LIMIT),
    location: location ?? undefined,
    message: `upstream ${response.status} (${contentType || "no content-type"})${hint}`,
    status: 502,
  });
};

interface Completion {
  readonly body: ReadableStream<Uint8Array>;
  readonly conversation: Conversation;
  readonly conversationId: string;
  readonly cookie: string;
  readonly facts: UpstreamFacts;
  readonly log: RequestLogger;
  readonly model: string;
  readonly startedAt: number;
  readonly wire: Wire;
}

/** What one reply amounted to, for the wide event. */
interface Tally {
  calls: number;
  chars: number;
  deltas: number;
  finishReason: string;
  msToFirstChunk: number | undefined;
  reasoningChars: number;
  readonly skips: SSESkips;
}

const newTally = (): Tally => ({
  calls: 0,
  chars: 0,
  deltas: 0,
  finishReason: "stop",
  msToFirstChunk: undefined,
  reasoningChars: 0,
  skips: { count: 0, types: new Set() },
});

const tallyFields = (tally: Tally) => ({
  deltas: tally.deltas,
  finishReason: tally.finishReason,
  msToFirstChunk: tally.msToFirstChunk,
  reasoningChars: tally.reasoningChars,
  replyChars: tally.chars,
  toolCalls: tally.calls,
  undecodedEvents: tally.skips.count,
  undecodedTypes: [...tally.skips.types].join(","),
});

const settle = (tally: Tally): void => {
  if (tally.calls > 0 && tally.finishReason === "stop") {
    tally.finishReason = TOOL_CALLS;
  }
};

const streamCompletion = (
  completion: Completion,
  deferEmit: DeferredEmit
): Response => {
  const {
    body,
    conversation,
    conversationId,
    cookie,
    facts,
    log,
    model,
    startedAt,
    wire,
  } = completion;
  deferEmit.value = true;
  let guarded: GuardedController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      guarded?.abandon();
    },
    async start(controller) {
      const out = guardController(controller);
      guarded = out;
      const frames = wire.stream();
      const send = (text: string): void => {
        out.enqueue(encoder.encode(text));
      };
      const tally = newTally();
      const emit = (parts: readonly ReplyPart[]): void => {
        for (const part of parts) {
          if (part.type === "text") {
            tally.chars += part.text.length;
            send(frames.text(part.text));
          } else {
            tally.calls += 1;
            send(frames.call(part.call));
          }
        }
      };
      const splitter = splitReply(conversation.tools);
      try {
        send(frames.open());
        for await (const event of parseAipassSSE(body, tally.skips)) {
          if (event.kind === "delta") {
            tally.msToFirstChunk ??= Date.now() - startedAt;
            tally.deltas += 1;
            emit(splitter.push(event.text));
          } else if (event.kind === "reasoning") {
            tally.reasoningChars += event.text.length;
          } else if (event.kind === "finish") {
            tally.finishReason = event.reason;
          } else {
            log.error(new Error(`upstream stream: ${event.message}`));
            send(frames.text(`\n[proxy: ${event.message}]`));
          }
        }
        emit(splitter.flush());
      } catch (error) {
        log.error(asError(error));
        tally.finishReason = "error";
        send(frames.text(`\n[proxy error: ${error}]`));
      } finally {
        settle(tally);
        const [{ after, usage }] = await Promise.all([
          settleCredits(cookie, facts.credits),
          deleteConversation(cookie, conversationId),
        ]);
        send(frames.close(tally.finishReason, usage));
        log.set({
          ...tallyFields(tally),
          clientAborted: !out.isOpen(),
          creditsSpent: usage?.spent,
          status: out.isOpen() ? 200 : CLIENT_CLOSED_STATUS,
        });
        await recordUpstream(facts, model, log, after);
        log.emit();
        out.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
};

const bufferedCompletion = async (
  completion: Completion
): Promise<Response> => {
  const {
    body,
    conversation,
    conversationId,
    cookie,
    facts,
    log,
    model,
    startedAt,
    wire,
  } = completion;
  const tally = newTally();
  const calls: ToolCall[] = [];
  let text = "";
  const collect = (parts: readonly ReplyPart[]): void => {
    for (const part of parts) {
      if (part.type === "text") {
        text += part.text;
      } else {
        calls.push(part.call);
      }
    }
  };
  const splitter = splitReply(conversation.tools);
  try {
    for await (const event of parseAipassSSE(body, tally.skips)) {
      if (event.kind === "delta") {
        tally.msToFirstChunk ??= Date.now() - startedAt;
        tally.deltas += 1;
        collect(splitter.push(event.text));
      } else if (event.kind === "reasoning") {
        tally.reasoningChars += event.text.length;
      } else if (event.kind === "finish") {
        tally.finishReason = event.reason;
      } else {
        return failUpstream(
          wire,
          log,
          `upstream stream: ${event.message}`,
          event.message
        );
      }
    }
    collect(splitter.flush());
  } catch (error) {
    return failUpstream(wire, log, error, `stream error: ${error}`);
  } finally {
    await deleteConversation(cookie, conversationId);
    tally.calls = calls.length;
    tally.chars = text.length;
    settle(tally);
    log.set(tallyFields(tally));
  }
  const { after, usage } = await settleCredits(cookie, facts.credits);
  log.set({ creditsSpent: usage?.spent });
  await recordUpstream(facts, model, log, after);
  return wire.reply({
    calls,
    credits: usage,
    finishReason: tally.finishReason,
    text,
  });
};

const runTurn = async (
  clientId: string,
  cookie: string,
  turn: TurnRequest
): Promise<Response> => {
  const { conversation, deferEmit, log, model, request, stream, wire } = turn;
  const { signal } = request;
  const startedAt = Date.now();
  const facts: UpstreamFacts = {
    catalog: fetchCatalog(clientId, cookie, signal),
    credits: fetchCredits(cookie, signal),
    identity: fetchIdentity(clientId, cookie, signal),
  };
  const { turns, tools } = conversation;

  log.set({
    completionId: wire.id,
    messageCount: turns.length,
    model,
    promptChars: turns.reduce((sum, item) => sum + item.content.length, 0),
    protocol: wire.protocol,
    streaming: stream,
    toolCount: tools.length,
  });

  let result: SendResult;
  try {
    result = await sendMessage(
      cookie,
      model,
      toAipassMessages(conversation, model),
      signal
    );
  } catch (error) {
    await recordUpstream(facts, model, log);
    return failUpstream(wire, log, error, `upstream fetch failed: ${error}`);
  }

  const { response: upstream, conversationId } = result;
  const contentType = upstream.headers.get("content-type") ?? "";
  const upstreamBody = upstream.ok ? upstream.body : null;
  log.set({
    conversationId,
    msToUpstream: Date.now() - startedAt,
    upstreamStatus: upstream.status,
  });
  if (!upstreamBody || !contentType.includes("event-stream")) {
    await recordUpstream(facts, model, log);
    return await upstreamError(wire, cookie, upstream, conversationId, log);
  }

  const completion: Completion = {
    body: upstreamBody,
    conversation,
    conversationId,
    cookie,
    facts,
    log,
    model,
    startedAt,
    wire,
  };
  return stream
    ? streamCompletion(completion, deferEmit)
    : await bufferedCompletion(completion);
};

/** Authenticates the request, then runs the turn it describes. */
export const serveTurn = (turn: TurnRequest): Promise<Response> | Response => {
  const { log, request, wire } = turn;
  const lookup = cookieFromRequest(request);
  if (!lookup.ok) {
    log.set({ authReason: lookup.reason, status: 401 });
    return wire.fail({ message: lookup.reason, status: 401 });
  }
  const { cookie } = lookup;
  const clientId = clientIdFromCookie(cookie);
  log.set({ clientId });
  return runTurn(clientId, cookie, turn);
};
