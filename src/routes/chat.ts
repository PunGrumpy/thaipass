import { Elysia } from "elysia";
import type { RequestLogger } from "evlog";

import { fetchCatalog } from "../aipass/catalog";
import type { Catalog } from "../aipass/catalog";
import { deleteConversation, sendMessage } from "../aipass/client";
import type { SendResult } from "../aipass/client";
import { DEFAULT_MODEL } from "../aipass/models";
import { fetchCredits } from "../aipass/quotas";
import type { Credits } from "../aipass/quotas";
import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { parseAipassSSE } from "../aipass/stream";
import type { SSESkips } from "../aipass/stream";
import { requestLogger } from "../lib/logger";
import type { DeferredEmit } from "../lib/logger";
import { errorResponse } from "../openai/errors";
import { chatRequestSchema } from "../openai/schema";
import type { ChatRequest } from "../openai/schema";
import { chatChunk, chatCompletion } from "../openai/wire";
import type { ChatCompletionChunk } from "../openai/wire";
import { toAipassMessages } from "../translate";

const encoder = new TextEncoder();

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

const failUpstream = (
  log: RequestLogger,
  cause: unknown,
  message: string
): Response => {
  log.set({ status: 502 });
  log.error(asError(cause));
  return errorResponse(message, 502);
};

interface UpstreamFacts {
  readonly credits: Promise<Credits | null>;
  readonly catalog: Promise<Catalog | null>;
}

const recordUpstream = async (
  facts: UpstreamFacts,
  model: string,
  log: RequestLogger
): Promise<void> => {
  const [credits, catalog] = await Promise.all([facts.credits, facts.catalog]);
  if (credits) {
    log.set({ ...credits });
  }
  const entry = catalog?.get(model);
  if (entry) {
    log.set({ modelFree: entry.free, modelReady: entry.ready });
  }
};
const DETAIL_LIMIT = 300;
const COMPLETION_ID_LENGTH = 16;
const CLIENT_CLOSED_STATUS = 499;

const upstreamError = async (
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
  return Response.json(
    {
      error: {
        detail: detail.slice(0, DETAIL_LIMIT),
        location: location ?? undefined,
        message: `upstream ${response.status} (${contentType || "no content-type"})${hint}`,
      },
    },
    { status: 502 }
  );
};

const streamCompletion = (
  cookie: string,
  id: string,
  model: string,
  body: ReadableStream<Uint8Array>,
  conversationId: string,
  log: RequestLogger,
  deferEmit: DeferredEmit,
  startedAt: number,
  facts: UpstreamFacts
): Response => {
  deferEmit.value = true;
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      open = false;
    },
    async start(controller) {
      const write = (frame: string): void => {
        if (!open) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          open = false;
        }
      };
      const send = (payload: ChatCompletionChunk): void => {
        write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      let finishReason = "stop";
      const skips: SSESkips = { count: 0, types: new Set() };
      let deltas = 0;
      let chars = 0;
      let reasoningChars = 0;
      let msToFirstChunk: number | undefined;
      try {
        send(chatChunk(id, model, { role: "assistant" }, null));
        for await (const event of parseAipassSSE(body, skips)) {
          if (event.kind === "delta") {
            msToFirstChunk ??= Date.now() - startedAt;
            deltas += 1;
            chars += event.text.length;
            send(chatChunk(id, model, { content: event.text }, null));
          } else if (event.kind === "reasoning") {
            reasoningChars += event.text.length;
          } else if (event.kind === "finish") {
            finishReason = event.reason;
          } else {
            log.error(new Error(`upstream stream: ${event.message}`));
            send(
              chatChunk(
                id,
                model,
                { content: `\n[proxy: ${event.message}]` },
                null
              )
            );
          }
        }
      } catch (error) {
        log.error(asError(error));
        finishReason = "error";
        send(
          chatChunk(id, model, { content: `\n[proxy error: ${error}]` }, null)
        );
      } finally {
        send(chatChunk(id, model, {}, finishReason));
        write("data: [DONE]\n\n");
        await deleteConversation(cookie, conversationId);
        log.set({
          clientAborted: !open,
          deltas,
          finishReason,
          msToFirstChunk,
          reasoningChars,
          replyChars: chars,
          status: open ? 200 : CLIENT_CLOSED_STATUS,
          undecodedEvents: skips.count,
          undecodedTypes: [...skips.types].join(","),
        });
        await recordUpstream(facts, model, log);
        log.emit();
        if (open) {
          try {
            controller.close();
          } catch {
            open = false;
          }
        }
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
  cookie: string,
  id: string,
  model: string,
  body: ReadableStream<Uint8Array>,
  conversationId: string,
  log: RequestLogger,
  startedAt: number,
  facts: UpstreamFacts
): Promise<Response> => {
  let content = "";
  let finishReason = "stop";
  const skips: SSESkips = { count: 0, types: new Set() };
  let deltas = 0;
  let reasoningChars = 0;
  let msToFirstChunk: number | undefined;
  try {
    for await (const event of parseAipassSSE(body, skips)) {
      if (event.kind === "delta") {
        msToFirstChunk ??= Date.now() - startedAt;
        deltas += 1;
        content += event.text;
      } else if (event.kind === "reasoning") {
        reasoningChars += event.text.length;
      } else if (event.kind === "finish") {
        finishReason = event.reason;
      } else {
        return failUpstream(
          log,
          `upstream stream: ${event.message}`,
          event.message
        );
      }
    }
  } catch (error) {
    return failUpstream(log, error, `stream error: ${error}`);
  } finally {
    await deleteConversation(cookie, conversationId);
    log.set({
      deltas,
      finishReason,
      msToFirstChunk,
      reasoningChars,
      replyChars: content.length,
      undecodedEvents: skips.count,
      undecodedTypes: [...skips.types].join(","),
    });
  }
  await recordUpstream(facts, model, log);
  return Response.json(chatCompletion(id, model, content, finishReason));
};

const handleChat = async (
  clientId: string,
  cookie: string,
  body: ChatRequest,
  signal: AbortSignal,
  log: RequestLogger,
  deferEmit: DeferredEmit
): Promise<Response> => {
  const startedAt = Date.now();
  const facts: UpstreamFacts = {
    catalog: fetchCatalog(clientId, cookie, signal),
    credits: fetchCredits(cookie, signal),
  };
  const { messages = [], model = DEFAULT_MODEL, stream } = body;
  const wantStream = stream !== false;
  const id = `chatcmpl-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, COMPLETION_ID_LENGTH)}`;

  log.set({
    completionId: id,
    messageCount: messages.length,
    model,
    promptChars: messages.reduce((sum, m) => sum + m.content.length, 0),
    streaming: wantStream,
  });

  let result: SendResult;
  try {
    result = await sendMessage(
      cookie,
      model,
      toAipassMessages(messages, model),
      signal
    );
  } catch (error) {
    await recordUpstream(facts, model, log);
    return failUpstream(log, error, `upstream fetch failed: ${error}`);
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
    return await upstreamError(cookie, upstream, conversationId, log);
  }

  return wantStream
    ? streamCompletion(
        cookie,
        id,
        model,
        upstreamBody,
        conversationId,
        log,
        deferEmit,
        startedAt,
        facts
      )
    : await bufferedCompletion(
        cookie,
        id,
        model,
        upstreamBody,
        conversationId,
        log,
        startedAt,
        facts
      );
};

export const chatRoutes = new Elysia()
  .use(requestLogger)
  .post(
    "/v1/chat/completions",
    { body: chatRequestSchema },
    ({ body, request, log, deferEmit }) => {
      const cookie = cookieFromRequest(request);
      if (!cookie) {
        log.set({ status: 401 });
        return errorResponse(
          "missing AI Pass session cookie, send it as Authorization: Bearer <cookie>",
          401
        );
      }
      const clientId = clientIdFromCookie(cookie);
      log.set({ clientId });
      return handleChat(clientId, cookie, body, request.signal, log, deferEmit);
    }
  );
