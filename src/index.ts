import { deleteConversation, sendMessage } from "./aipass.ts";
import type { SendResult } from "./aipass.ts";
import { config } from "./config.ts";
import { CHAT_MODELS, DEFAULT_MODEL } from "./models.ts";
import {
  chatChunk,
  chatCompletion,
  chatRequestSchema,
  parseAipassSSE,
  toAipassMessages,
} from "./translate.ts";
import type { ChatCompletionChunk } from "./translate.ts";

const encoder = new TextEncoder();
const DETAIL_LIMIT = 300;
const COMPLETION_ID_LENGTH = 16;

const errorResponse = (message: string, status: number): Response =>
  Response.json({ error: { message } }, { status });

/**
 * Turn an unusable upstream response (auth redirect, JSON error, wrong
 * content-type) into a 502 with a helpful message, cleaning up the conversation.
 */
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

const handleChat = async (req: Request): Promise<Response> => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("invalid JSON body", 400);
  }
  const decoded = chatRequestSchema.safeParse(payload);
  if (!decoded.success) {
    return errorResponse("body must be a chat completion request object", 400);
  }
  const { messages = [], model = DEFAULT_MODEL, stream } = decoded.data;
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
      req.signal
    );
  } catch (error) {
    return errorResponse(`upstream fetch failed: ${error}`, 502);
  }

  const { response: upstream, conversationId } = result;
  const contentType = upstream.headers.get("content-type") ?? "";
  const body = upstream.ok ? upstream.body : null;
  if (!body || !contentType.includes("event-stream")) {
    return await upstreamError(upstream, conversationId);
  }

  return wantStream
    ? streamCompletion(id, model, body, conversationId)
    : await bufferedCompletion(id, model, body, conversationId);
};

const handleModels = (): Response =>
  Response.json({
    data: CHAT_MODELS.map((modelId) => ({
      id: modelId,
      object: "model",
      owned_by: "aipass",
    })),
    object: "list",
  });

Bun.serve({
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      return handleChat(req);
    }
    if (url.pathname === "/v1/models") {
      return handleModels();
    }
    if (url.pathname === "/health" || url.pathname === "/") {
      return Response.json({
        models: CHAT_MODELS.length,
        ok: true,
        origin: config.origin,
      });
    }
    return errorResponse("not found", 404);
  },
  hostname: config.host,
  idleTimeout: config.idleTimeout,
  port: config.port,
});

console.error(
  `aipass-proxy on http://${config.host}:${config.port} -> ${config.origin}`
);
