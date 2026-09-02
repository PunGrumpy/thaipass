import { Elysia } from "elysia";

import { deleteConversation, sendMessage } from "../lib/aipass.ts";
import type { SendResult } from "../lib/aipass.ts";
import { errorResponse } from "../lib/http.ts";
import { DEFAULT_MODEL } from "../lib/models.ts";
import {
  chatChunk,
  chatCompletion,
  chatRequestSchema,
  parseAipassSSE,
  toAipassMessages,
} from "../lib/translate.ts";
import type { ChatCompletionChunk, ChatRequest } from "../lib/translate.ts";

const encoder = new TextEncoder();
const DETAIL_LIMIT = 300;
const COMPLETION_ID_LENGTH = 16;

const upstreamError = async (
  response: Response,
  conversationId: string
): Promise<Response> => {
  const contentType = response.headers.get("content-type") ?? "";
  const location = response.headers.get("location");
  const detail = response.body ? await response.text().catch(() => "") : "";
  deleteConversation(conversationId);
  const staleCookie =
    response.status >= 300 &&
    response.status < 400 &&
    (location ?? "").includes("sign-in");
  const hint = staleCookie ? "; cookie is stale, re-auth needed" : "";
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
  id: string,
  model: string,
  body: ReadableStream<Uint8Array>,
  conversationId: string
): Response => {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: ChatCompletionChunk): void => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };
      send(chatChunk(id, model, { role: "assistant" }, null));
      let finishReason = "stop";
      try {
        for await (const event of parseAipassSSE(body)) {
          if (event.kind === "delta") {
            send(chatChunk(id, model, { content: event.text }, null));
          } else if (event.kind === "finish") {
            finishReason = event.reason;
          } else {
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
        send(
          chatChunk(id, model, { content: `\n[proxy error: ${error}]` }, null)
        );
      }
      send(chatChunk(id, model, {}, finishReason));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
      deleteConversation(conversationId);
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
  id: string,
  model: string,
  body: ReadableStream<Uint8Array>,
  conversationId: string
): Promise<Response> => {
  let content = "";
  let finishReason = "stop";
  try {
    for await (const event of parseAipassSSE(body)) {
      if (event.kind === "delta") {
        content += event.text;
      } else if (event.kind === "finish") {
        finishReason = event.reason;
      } else {
        return errorResponse(event.message, 502);
      }
    }
  } catch (error) {
    return errorResponse(`stream error: ${error}`, 502);
  } finally {
    deleteConversation(conversationId);
  }
  return Response.json(chatCompletion(id, model, content, finishReason));
};

const handleChat = async (
  body: ChatRequest,
  signal: AbortSignal
): Promise<Response> => {
  const { messages = [], model = DEFAULT_MODEL, stream } = body;
  const wantStream = stream !== false;
  const id = `chatcmpl-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, COMPLETION_ID_LENGTH)}`;

  let result: SendResult;
  try {
    result = await sendMessage(
      model,
      toAipassMessages(messages, model),
      signal
    );
  } catch (error) {
    return errorResponse(`upstream fetch failed: ${error}`, 502);
  }

  const { response: upstream, conversationId } = result;
  const contentType = upstream.headers.get("content-type") ?? "";
  const upstreamBody = upstream.ok ? upstream.body : null;
  if (!upstreamBody || !contentType.includes("event-stream")) {
    return await upstreamError(upstream, conversationId);
  }

  return wantStream
    ? streamCompletion(id, model, upstreamBody, conversationId)
    : await bufferedCompletion(id, model, upstreamBody, conversationId);
};

export const chatRoutes = new Elysia().post(
  "/v1/chat/completions",
  { body: chatRequestSchema },
  ({ body, request }) => handleChat(body, request.signal)
);
