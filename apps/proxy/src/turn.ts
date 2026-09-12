import { chatModelProblem, fetchCatalog } from "@thaipass/core/aipass/catalog";
import type { Catalog } from "@thaipass/core/aipass/catalog";
import { deleteConversation, sendMessage } from "@thaipass/core/aipass/client";
import type { SendResult } from "@thaipass/core/aipass/client";
import { fetchIdentity } from "@thaipass/core/aipass/identity";
import type { Identity } from "@thaipass/core/aipass/identity";
import { InlineError } from "@thaipass/core/aipass/inline";
import { renderAsset } from "@thaipass/core/aipass/media";
import { costOf, modelPrices } from "@thaipass/core/aipass/pricing";
import type { PriceTable } from "@thaipass/core/aipass/pricing";
import { fetchCredits, settleCredits } from "@thaipass/core/aipass/quotas";
import type { CreditUsage, Credits } from "@thaipass/core/aipass/quotas";
import {
  EDGE_REFUSAL_CLIENT_STATUS,
  EDGE_REFUSAL_HINT,
  isEdgeRefusal,
} from "@thaipass/core/aipass/refusal";
import {
  clientIdFromCookie,
  cookieFromRequest,
} from "@thaipass/core/aipass/session";
import type { ThinkingLevel } from "@thaipass/core/aipass/thinking";
import { UploadError } from "@thaipass/core/aipass/upload";
import { guardController } from "@thaipass/core/lib/stream";
import type { GuardedController } from "@thaipass/core/lib/stream";
import {
  finishReasonOf,
  isAbandonedToolCall,
  prepareTurn,
  readReply,
  replyTokens,
} from "@thaipass/core/reply";
import type {
  PreparedTurn,
  ReplyReader,
  ReplyTally,
} from "@thaipass/core/reply";
import type { ToolCall } from "@thaipass/core/tools";
import { toAipassMessages } from "@thaipass/core/translate";
import type { Conversation } from "@thaipass/core/translate";
import type { RequestLogger } from "evlog";

import type { DeferredEmit } from "./lib/logger";

/**
 * One turn against AI Pass. The turn is the same whichever protocol asked for
 * it; a `Wire` decides only the shape of the bytes going back.
 */

export interface Failure {
  readonly status: number;
  readonly message: string;
  readonly detail?: string;
  readonly location?: string;
}

export interface Reply {
  readonly calls: readonly ToolCall[];
  /** List-price dollars for the tokens, when OpenRouter prices the model. */
  readonly cost?: number;
  readonly credits?: CreditUsage;
  readonly finishReason: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly text: string;
}

/** Renders one streamed reply; a fresh one per response so it can hold state. */
export interface StreamWire {
  readonly open: () => string;
  readonly text: (delta: string) => string;
  readonly call: (call: ToolCall) => string;
  readonly close: (
    finishReason: string,
    outputTokens: number,
    credits?: CreditUsage,
    cost?: number
  ) => string;
}

export interface Wire {
  readonly id: string;
  readonly protocol: string;
  readonly fail: (failure: Failure) => Response;
  readonly stream: (inputTokens: number) => StreamWire;
  readonly reply: (reply: Reply) => Response;
}

export interface TurnRequest {
  readonly conversation: Conversation;
  readonly deferEmit: DeferredEmit;
  readonly log: RequestLogger;
  readonly model: string;
  readonly request: Request;
  readonly stream: boolean;
  readonly thinking?: ThinkingLevel;
  readonly wire: Wire;
}

const encoder = new TextEncoder();
const DETAIL_LIMIT = 300;
const CLIENT_CLOSED_STATUS = 499;
const ABANDONED = "upstream ended on tool-calls with no call to make";

/**
 * A broken tool call is upstream's own failure and a fresh conversation often
 * survives it, so a buffered turn gets more than one go at it. Streaming does
 * not: bytes are already on the wire by the time the failure arrives.
 */
const BUFFERED_ATTEMPTS = 3;

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

/**
 * The turn in dollars, for a client that reports money and cannot read
 * credits. Nothing waits on it: a price table that is cold or a model
 * OpenRouter does not list simply leaves the figure out.
 */
const costFor = async (
  facts: UpstreamFacts,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<number | undefined> =>
  costOf(model, { inputTokens, outputTokens }, await facts.prices);

interface UpstreamFacts {
  readonly credits: Promise<Credits | null>;
  readonly catalog: Promise<Catalog | null>;
  readonly identity: Promise<Identity | null>;
  /** Started with the turn, so a cold price table costs the reply nothing. */
  readonly prices: Promise<PriceTable | null>;
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

const hintFor = (staleCookie: boolean, edgeRefused: boolean): string => {
  if (staleCookie) {
    return "; cookie is stale, re-auth needed";
  }
  return edgeRefused ? EDGE_REFUSAL_HINT : "";
};

const upstreamError = async (
  wire: Wire,
  cookie: string,
  response: Response,
  conversation: { readonly id: string; readonly created: boolean },
  log: RequestLogger
): Promise<Response> => {
  const contentType = response.headers.get("content-type") ?? "";
  const location = response.headers.get("location");
  const detail = response.body ? await response.text().catch(() => "") : "";
  if (conversation.created) {
    await deleteConversation(cookie, conversation.id);
  }
  const staleCookie =
    response.status >= 300 &&
    response.status < 400 &&
    (location ?? "").includes("sign-in");
  const edgeRefused = isEdgeRefusal(response.status);
  const status = edgeRefused ? EDGE_REFUSAL_CLIENT_STATUS : 502;
  const hint = hintFor(staleCookie, edgeRefused);
  log.set({
    edgeRefused,
    staleCookie,
    status,
    upstreamContentType: contentType,
    upstreamStatus: response.status,
  });
  log.error(new Error(`upstream ${response.status}${hint}`));
  return wire.fail({
    detail: detail.slice(0, DETAIL_LIMIT),
    location: location ?? undefined,
    message: `upstream ${response.status} (${contentType || "no content-type"})${hint}`,
    status,
  });
};

interface Completion {
  readonly conversationId: string;
  readonly cookie: string;
  readonly facts: UpstreamFacts;
  readonly inputTokens: number;
  readonly log: RequestLogger;
  readonly model: string;
  readonly reader: ReplyReader;
  readonly wire: Wire;
}

const tallyFields = (tally: ReplyTally) => ({
  deltas: tally.deltas,
  files: tally.files,
  finishReason: finishReasonOf(tally),
  msToFirstChunk: tally.msToFirstChunk,
  reasoningChars: tally.reasoningChars,
  replyChars: tally.chars,
  replyTokens: replyTokens(tally),
  switchedModel: tally.switchedModel,
  toolCalls: tally.calls,
  undecodedEvents: tally.skips.count,
  undecodedTypes: [...tally.skips.types].join(","),
});

const streamCompletion = (
  completion: Completion,
  deferEmit: DeferredEmit
): Response => {
  const { conversationId, cookie, facts, log, model, reader, wire } =
    completion;
  const { tally } = reader;
  deferEmit.value = true;
  let guarded: GuardedController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      guarded?.abandon();
    },
    async start(controller) {
      const out = guardController(controller);
      guarded = out;
      const frames = wire.stream(completion.inputTokens);
      const send = (text: string): void => {
        out.enqueue(encoder.encode(text));
      };
      try {
        send(frames.open());
        for await (const event of reader.events) {
          if (event.kind === "text") {
            send(frames.text(event.text));
          } else if (event.kind === "call") {
            send(frames.call(event.call));
          } else if (event.kind === "file") {
            send(frames.text(renderAsset(event.asset)));
          } else if (event.kind === "error") {
            log.error(new Error(`upstream stream: ${event.message}`));
            send(frames.text(`\n[proxy: ${event.message}]`));
          }
        }
      } catch (error) {
        log.error(asError(error));
        tally.finishReason = "error";
        send(frames.text(`\n[proxy error: ${error}]`));
      } finally {
        const [{ after, usage }] = await Promise.all([
          settleCredits(cookie, facts.credits),
          deleteConversation(cookie, conversationId),
        ]);
        const outputTokens = replyTokens(tally);
        const cost = await costFor(
          facts,
          model,
          completion.inputTokens,
          outputTokens
        );
        send(frames.close(finishReasonOf(tally), outputTokens, usage, cost));
        log.set({
          ...tallyFields(tally),
          clientAborted: !out.isOpen(),
          costUsd: cost,
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

interface Attempt {
  readonly response: Response;
  /** Upstream broke the tool call itself, rather than refusing the request. */
  readonly retry: boolean;
}

const bufferedCompletion = async (completion: Completion): Promise<Attempt> => {
  const { conversationId, cookie, facts, log, model, reader, wire } =
    completion;
  const { tally } = reader;
  const calls: ToolCall[] = [];
  let text = "";
  try {
    for await (const event of reader.events) {
      if (event.kind === "text") {
        text += event.text;
      } else if (event.kind === "call") {
        calls.push(event.call);
      } else if (event.kind === "file") {
        text += renderAsset(event.asset);
      } else if (event.kind === "error") {
        return {
          response: failUpstream(
            wire,
            log,
            `upstream stream: ${event.message}`,
            event.message
          ),
          retry: event.tool !== undefined,
        };
      }
    }
  } catch (error) {
    return {
      response: failUpstream(wire, log, error, `stream error: ${error}`),
      retry: false,
    };
  } finally {
    await deleteConversation(cookie, conversationId);
    log.set(tallyFields(tally));
  }
  const { after, usage } = await settleCredits(cookie, facts.credits);
  const outputTokens = replyTokens(tally);
  const cost = await costFor(
    facts,
    model,
    completion.inputTokens,
    outputTokens
  );
  log.set({ costUsd: cost, creditsSpent: usage?.spent });
  await recordUpstream(facts, model, log, after);
  if (isAbandonedToolCall(tally)) {
    return {
      response: failUpstream(wire, log, ABANDONED, ABANDONED),
      retry: true,
    };
  }
  return {
    response: wire.reply({
      calls,
      cost,
      credits: usage,
      finishReason: finishReasonOf(tally),
      inputTokens: completion.inputTokens,
      outputTokens,
      text,
    }),
    retry: false,
  };
};

interface Send {
  readonly conversation: Conversation;
  readonly cookie: string;
  readonly facts: UpstreamFacts;
  readonly log: RequestLogger;
  readonly model: string;
  readonly prepared: PreparedTurn;
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly wire: Wire;
}

/** One trip upstream: a throwaway conversation, the send, a reader over the reply. */
const openAttempt = async (send: Send): Promise<Completion | Response> => {
  const { conversation, cookie, facts, log, model, prepared, signal, wire } =
    send;
  let result: SendResult;
  try {
    result = await sendMessage(
      cookie,
      model,
      toAipassMessages(prepared.prompt, model),
      signal,
      prepared.sendOptions
    );
  } catch (error) {
    await recordUpstream(facts, model, log);
    if (error instanceof UploadError) {
      log.set({ status: 400 });
      log.error(error);
      return wire.fail({ message: error.message, status: 400 });
    }
    return failUpstream(wire, log, error, `upstream fetch failed: ${error}`);
  }

  const { response: upstream, conversationId, created } = result;
  const contentType = upstream.headers.get("content-type") ?? "";
  const upstreamBody = upstream.ok ? upstream.body : null;
  log.set({
    conversationId,
    msToUpstream: Date.now() - send.startedAt,
    upstreamStatus: upstream.status,
  });
  if (!upstreamBody || !contentType.includes("event-stream")) {
    await recordUpstream(facts, model, log);
    return await upstreamError(
      wire,
      cookie,
      upstream,
      { created, id: conversationId },
      log
    );
  }

  return {
    conversationId,
    cookie,
    facts,
    inputTokens: prepared.inputTokens,
    log,
    model,
    reader: readReply({
      body: upstreamBody,
      cookie,
      signal,
      startedAt: send.startedAt,
      tools: conversation.tools,
    }),
    wire,
  };
};

/**
 * A buffered turn can be tried again, because nothing has reached the caller
 * yet. Only a broken tool call earns a second go: every other failure repeats.
 */
const bufferedTurn = async (send: Send): Promise<Response> => {
  const { log, signal } = send;
  let attempts = 0;
  // Each attempt decides whether there is another, so they cannot run together.
  // oxlint-disable no-await-in-loop
  for (;;) {
    attempts += 1;
    log.set({ attempts });
    const opened = await openAttempt(send);
    if (opened instanceof Response) {
      return opened;
    }
    const attempt = await bufferedCompletion(opened);
    if (!attempt.retry || attempts >= BUFFERED_ATTEMPTS || signal.aborted) {
      return attempt.response;
    }
  }
  // oxlint-enable no-await-in-loop
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
    prices: modelPrices(),
  };
  log.set({
    completionId: wire.id,
    messageCount: conversation.turns.length,
    model,
    protocol: wire.protocol,
    streaming: stream,
    toolCount: conversation.tools.length,
  });

  /** The catalog decides the model, so it is read before anything is sent. */
  const problem = chatModelProblem(model, await facts.catalog);
  if (problem) {
    log.set({ status: 400 });
    return wire.fail({ message: problem, status: 400 });
  }

  /** A file the proxy cannot read fails the request rather than being dropped. */
  let prepared: PreparedTurn;
  try {
    prepared = await prepareTurn(
      conversation,
      model,
      turn.thinking,
      () => facts.catalog
    );
  } catch (error) {
    const message =
      error instanceof InlineError ? error.message : String(error);
    log.set({ status: 400 });
    return wire.fail({ message, status: 400 });
  }
  const { inputTokens, prompt, sendOptions } = prepared;
  log.set({
    attachmentCount: sendOptions.attachments?.length ?? 0,
    promptChars: prompt.length,
    promptTokens: inputTokens,
  });
  if (turn.thinking !== undefined) {
    log.set({
      thinkingDropped: prepared.thinkingDropped,
      thinkingLevel: prepared.thinkingLevel,
    });
  }

  const send: Send = {
    conversation,
    cookie,
    facts,
    log,
    model,
    prepared,
    signal,
    startedAt,
    wire,
  };
  if (stream) {
    log.set({ attempts: 1 });
    const opened = await openAttempt(send);
    return opened instanceof Response
      ? opened
      : streamCompletion(opened, deferEmit);
  }
  return await bufferedTurn(send);
};

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
