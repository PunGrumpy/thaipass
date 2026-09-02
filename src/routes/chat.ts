import { Elysia } from "elysia";
import type { RequestLogger } from "evlog";

import { deleteConversation, sendMessage } from "../lib/aipass.ts";
import type { SendResult } from "../lib/aipass.ts";
import { clientIdFromCookie, cookieFromRequest } from "../lib/auth.ts";
import { errorResponse } from "../lib/http.ts";
import { requestLogger } from "../lib/logger.ts";
import type { DeferredEmit } from "../lib/logger.ts";
import { DEFAULT_MODEL } from "../lib/models.ts";
import {
  chatChunk,
  chatCompletion,
  chatRequestSchema,
  parseAipassSSE,
  toAipassMessages,
} from "../lib/translate.ts";
import type {
  ChatCompletionChunk,
  ChatRequest,
  SSESkips,
} from "../lib/translate.ts";

const encoder = new TextEncoder();
const DETAIL_LIMIT = 300;
const COMPLETION_ID_LENGTH = 16;

const upstreamError = async (
  cookie: string,
  response: Response,
  conversationId: string,
  log: RequestLogger
): Promise<Response> => {
  const contentType = response.headers.get("content-type") ?? "";
  const location = response.headers.get("location");
  const detail = response.body ? await response.text().catch(() => "") : "";
  deleteConversation(cookie, conversationId);
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
  startedAt: number
): Response => {
  deferEmit.value = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: ChatCompletionChunk): void => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };
      send(chatChunk(id, model, { role: "assistant" }, null));
      let finishReason = "stop";
      const skips: SSESkips = { count: 0 };
      let deltas = 0;
      let chars = 0;
      let msToFirstChunk: number | undefined;
      try {
        for await (const event of parseAipassSSE(body, skips)) {
          if (event.kind === "delta") {
            msToFirstChunk ??= Date.now() - startedAt;
            deltas += 1;
            chars += event.text.length;
            send(chatChunk(id, model, { content: event.text }, null));
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
        log.error(error instanceof Error ? error : new Error(String(error)));
        finishReason = "error";
        send(
          chatChunk(id, model, { content: `\n[proxy error: ${error}]` }, null)
        );
      }
      send(chatChunk(id, model, {}, finishReason));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
      deleteConversation(cookie, conversationId);
      log.set({
        deltas,
        finishReason,
        msToFirstChunk,
        replyChars: chars,
        status: 200,
        undecodedEvents: skips.count,
      });
      log.emit();
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
  startedAt: number
): Promise<Response> => {
  let content = "";
  let finishReason = "stop";
  const skips: SSESkips = { count: 0 };
  let deltas = 0;
  let msToFirstChunk: number | undefined;
  try {
    for await (const event of parseAipassSSE(body, skips)) {
      if (event.kind === "delta") {
        msToFirstChunk ??= Date.now() - startedAt;
        deltas += 1;
        content += event.text;
      } else if (event.kind === "finish") {
        finishReason = event.reason;
      } else {
        log.set({ status: 502 });
        log.error(new Error(`upstream stream: ${event.message}`));
        return errorResponse(event.message, 502);
      }
    }
  } catch (error) {
    log.set({ status: 502 });
    log.error(error instanceof Error ? error : new Error(String(error)));
    return errorResponse(`stream error: ${error}`, 502);
  } finally {
    deleteConversation(cookie, conversationId);
    log.set({
      deltas,
      finishReason,
      msToFirstChunk,
      replyChars: content.length,
      undecodedEvents: skips.count,
    });
  }
  return Response.json(chatCompletion(id, model, content, finishReason));
};

const handleChat = async (
  cookie: string,
  body: ChatRequest,
  signal: AbortSignal,
  log: RequestLogger,
  deferEmit: DeferredEmit
): Promise<Response> => {
  const startedAt = Date.now();
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
    log.set({ status: 502 });
    log.error(error instanceof Error ? error : new Error(String(error)));
    return errorResponse(`upstream fetch failed: ${error}`, 502);
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
        startedAt
      )
    : await bufferedCompletion(
        cookie,
        id,
        model,
        upstreamBody,
        conversationId,
        log,
        startedAt
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
      log.set({ clientId: clientIdFromCookie(cookie) });
      return handleChat(cookie, body, request.signal, log, deferEmit);
    }
  );
