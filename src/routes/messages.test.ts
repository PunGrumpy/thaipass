import { afterEach, expect, test } from "bun:test";

import { z } from "zod";

import type { messagesRequestSchema } from "../anthropic/schema";
import { app } from "../app";
import {
  DELETE_PATH,
  sseResponse,
  stubUpstream,
  textDeltas,
} from "../testing/upstream";
import type { Upstream } from "../testing/upstream";
import { FENCE_CLOSE, FENCE_OPEN } from "../tools";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const API_KEY_HEADERS = { "x-api-key": COOKIE };

/** The request as a client writes it, with the model left open so a bad one can be sent. */
type MessagesBody = Partial<
  Omit<z.input<typeof messagesRequestSchema>, "model">
> & { readonly model?: string };

let upstream: Upstream;

const WEATHER = {
  description: "Reads the weather.",
  input_schema: { type: "object" },
  name: "get_weather",
};

const messagesRequest = (
  body: MessagesBody,
  headers: Record<string, string> = API_KEY_HEADERS
): Request =>
  new Request("https://proxy.test/v1/messages", {
    body: JSON.stringify({
      max_tokens: 1024,
      messages: [{ content: "hi", role: "user" }],
      ...body,
    }),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

const errorSchema = z.object({
  error: z.object({ message: z.string(), type: z.string() }),
  type: z.literal("error"),
});

const messageSchema = z.object({
  content: z.array(
    z.union([
      z.object({ text: z.string(), type: z.literal("text") }),
      z.object({
        id: z.string(),
        input: z.record(z.string(), z.unknown()),
        name: z.string(),
        type: z.literal("tool_use"),
      }),
    ])
  ),
  id: z.string(),
  role: z.literal("assistant"),
  stop_reason: z.string(),
  type: z.literal("message"),
});

const events = (text: string): string[] =>
  text
    .split("\n")
    .filter((line) => line.startsWith("event: "))
    .map((line) => line.slice("event: ".length));

const callBlock = `${FENCE_OPEN}{"name":"get_weather","input":{"city":"Bangkok"}}${FENCE_CLOSE}`;

afterEach(() => {
  upstream.restore();
});

test("rejects a request without a credential in the anthropic error shape", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(messagesRequest({}, {}));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(401);
  expect(body.error.type).toBe("authentication_error");
});

test("takes the cookie from x-api-key", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(messagesRequest({}));
  expect(response.status).toBe(200);
});

test("takes the cookie from a bearer token too", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    messagesRequest({}, { authorization: `Bearer ${COOKIE}` })
  );
  expect(response.status).toBe(200);
});

test("answers a malformed body in the anthropic error shape", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(messagesRequest({ model: "claude-3" }));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(400);
  expect(body.error.type).toBe("invalid_request_error");
});

test("buffers the reply by default", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(messagesRequest({}));
  const body = messageSchema.parse(await response.json());
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(body.content).toEqual([{ text: "chunk0chunk1", type: "text" }]);
  expect(body.stop_reason).toBe("end_turn");
  expect(body.id.startsWith("msg_")).toBe(true);
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("streams the reply as anthropic events when asked", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(messagesRequest({ stream: true }));
  const text = await response.text();
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(events(text)).toEqual([
    "message_start",
    "content_block_start",
    "content_block_delta",
    "content_block_delta",
    "content_block_stop",
    "message_delta",
    "message_stop",
  ]);
  expect(text).toContain('"text":"chunk0"');
  expect(text).toContain('"stop_reason":"end_turn"');
  expect(await upstream.deleted()).toBe(true);
});

test("maps a length finish onto max_tokens", async () => {
  upstream = stubUpstream(
    sseResponse([...textDeltas(1), '{"type":"finish","finishReason":"length"}'])
  );
  const response = await app.fetch(messagesRequest({}));
  const body = messageSchema.parse(await response.json());
  expect(body.stop_reason).toBe("max_tokens");
});

test("returns a tool call as a tool_use block", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"text-delta","delta":"Checking.\\n\\n"}',
      `{"type":"text-delta","delta":${JSON.stringify(callBlock)}}`,
    ])
  );
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  const body = messageSchema.parse(await response.json());
  expect(body.stop_reason).toBe("tool_use");
  expect(body.content[0]).toEqual({ text: "Checking.\n\n", type: "text" });
  expect(body.content[1]).toMatchObject({
    input: { city: "Bangkok" },
    name: "get_weather",
    type: "tool_use",
  });
});

test("streams a tool call as its own content block", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"text-delta","delta":"Checking."}',
      `{"type":"text-delta","delta":${JSON.stringify(`\n${callBlock}`)}}`,
    ])
  );
  const response = await app.fetch(
    messagesRequest({ stream: true, tools: [WEATHER] })
  );
  const text = await response.text();
  expect(events(text)).toEqual([
    "message_start",
    "content_block_start",
    "content_block_delta",
    "content_block_delta",
    "content_block_stop",
    "content_block_start",
    "content_block_delta",
    "content_block_stop",
    "message_delta",
    "message_stop",
  ]);
  expect(text).toContain('"type":"tool_use"');
  expect(text).toContain('"partial_json":"{\\"city\\":\\"Bangkok\\"}"');
  expect(text).toContain('"stop_reason":"tool_use"');
});

test("leaves a fence alone when no tools were offered", async () => {
  upstream = stubUpstream(
    sseResponse([`{"type":"text-delta","delta":${JSON.stringify(callBlock)}}`])
  );
  const response = await app.fetch(messagesRequest({}));
  const body = messageSchema.parse(await response.json());
  expect(body.stop_reason).toBe("end_turn");
  expect(body.content).toEqual([{ text: callBlock, type: "text" }]);
});

test("returns 502 in the anthropic error shape when upstream is not a stream", async () => {
  upstream = stubUpstream(
    () =>
      new Response("<html>sign in</html>", {
        headers: { "content-type": "text/html", location: "/auth/sign-in" },
        status: 302,
      })
  );
  const response = await app.fetch(messagesRequest({}));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(502);
  expect(body.error.type).toBe("api_error");
  expect(body.error.message).toContain("cookie is stale");
  expect(upstream.calls).toContain(DELETE_PATH);
});
