import { afterEach, expect, test } from "bun:test";

import {
  DELETE_PATH,
  SEND_PREFIX,
  quotaResponse,
  sseResponse,
  stubUpstream,
  textDeltas,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { FENCE_CLOSE, FENCE_OPEN } from "@thaipass/core/tools";
import { z } from "zod";

import type { messagesRequestSchema } from "../anthropic/schema";
import { app } from "../app";

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

const countSchema = z.object({ input_tokens: z.number().int() });

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

test("answers an unknown model in the anthropic error shape", async () => {
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

const TOOL_FAILURE = [
  '{"type":"tool-input-error","toolName":"search","errorText":"boom"}',
  '{"type":"text-delta","delta":"Sorry, I could not respond to this request."}',
  '{"type":"finish","finishReason":"tool-calls"}',
];

const sends = (stub: Upstream): number =>
  stub.calls.filter((path) => path.startsWith(SEND_PREFIX)).length;

/** Each call answers from the queue, so an attempt can differ from the one before it. */
const sseSequence = (turns: readonly (readonly string[])[]) => {
  let index = 0;
  return (): Response => {
    const frames = turns[Math.min(index, turns.length - 1)] ?? [];
    index += 1;
    return sseResponse(frames)();
  };
};

test("tries again when upstream breaks the tool call", async () => {
  upstream = stubUpstream(
    sseSequence([
      TOOL_FAILURE,
      [`{"type":"text-delta","delta":${JSON.stringify(callBlock)}}`],
    ])
  );
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  const body = messageSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(body.stop_reason).toBe("tool_use");
  expect(sends(upstream)).toBe(2);
});

test("tries again when upstream abandons the tool call", async () => {
  upstream = stubUpstream(
    sseSequence([
      [
        '{"type":"text-delta","delta":"Sorry, I could not respond to this request."}',
        '{"type":"finish","finishReason":"tool-calls"}',
      ],
      [`{"type":"text-delta","delta":${JSON.stringify(callBlock)}}`],
    ])
  );
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  expect(response.status).toBe(200);
  expect(sends(upstream)).toBe(2);
});

test("gives up after three attempts rather than looping", async () => {
  upstream = stubUpstream(sseResponse(TOOL_FAILURE));
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  expect(response.status).toBe(502);
  expect(sends(upstream)).toBe(3);
});

test("does not try again when upstream refuses the request itself", async () => {
  upstream = stubUpstream(
    sseResponse(['{"type":"error","errorText":"quota exceeded"}'])
  );
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(502);
  expect(body.error.message).toContain("quota exceeded");
  expect(sends(upstream)).toBe(1);
});

test("does not try again once a streamed reply has left", async () => {
  upstream = stubUpstream(sseResponse(TOOL_FAILURE));
  const response = await app.fetch(
    messagesRequest({ stream: true, tools: [WEATHER] })
  );
  await response.text();
  expect(sends(upstream)).toBe(1);
});

test("refuses the apology upstream sends when its own tool failed", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"tool-input-error","toolName":"search","errorText":"boom"}',
      '{"type":"text-delta","delta":"Sorry, I could not respond to this request."}',
      '{"type":"finish","finishReason":"tool-calls"}',
    ])
  );
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(502);
  expect(body.error.type).toBe("api_error");
  expect(body.error.message).toContain("failed on search");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("refuses a reply that finished on tool-calls having made none", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"text-delta","delta":"Sorry, I could not respond to this request."}',
      '{"type":"finish","finishReason":"tool-calls"}',
    ])
  );
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(502);
  expect(body.error.message).toContain("no call to make");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("still answers when upstream finished on tool-calls and made one", async () => {
  upstream = stubUpstream(
    sseResponse([
      `{"type":"text-delta","delta":${JSON.stringify(callBlock)}}`,
      '{"type":"finish","finishReason":"tool-calls"}',
    ])
  );
  const response = await app.fetch(messagesRequest({ tools: [WEATHER] }));
  const body = messageSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(body.stop_reason).toBe("tool_use");
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

test("reports an edge refusal as an invalid_request_error rather than a bad gateway", async () => {
  upstream = stubUpstream(
    () =>
      new Response("<html>Request blocked</html>", {
        headers: { "content-type": "text/html" },
        status: 403,
      })
  );
  const response = await app.fetch(messagesRequest({}));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(400);
  expect(body.error.type).toBe("invalid_request_error");
  expect(body.error.message).toContain("before the model ran");
  expect(upstream.calls).toContain(DELETE_PATH);
});

const usageSchema = z.object({
  usage: z.object({
    credits: z
      .object({ spent: z.number().optional(), used: z.number() })
      .optional(),
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

const deltaUsageSchema = z.object({
  usage: z.object({
    credits: z.object({ spent: z.number().optional() }).optional(),
    output_tokens: z.number(),
  }),
});

const CREDIT_LIMIT = 10_000;
const USED_BEFORE = 100;
const USED_AFTER = 130.25;

test("reports the credits a buffered message spent in its usage", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const response = await app.fetch(messagesRequest({}));
  const { usage } = usageSchema.parse(await response.json());
  expect(usage.input_tokens).toBeGreaterThan(0);
  expect(usage.credits?.spent).toBe(USED_AFTER - USED_BEFORE);
  expect(usage.credits?.used).toBe(USED_AFTER);
});

test("reports the credits on message_delta when streaming", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const response = await app.fetch(messagesRequest({ stream: true }));
  const text = await response.text();
  const delta = text
    .split("\n")
    .find((line) => line.startsWith('data: {"delta":{"stop_reason"'));
  const { usage } = deltaUsageSchema.parse(JSON.parse(delta?.slice(6) ?? "{}"));
  expect(usage.output_tokens).toBeGreaterThan(0);
  expect(usage.credits?.spent).toBe(USED_AFTER - USED_BEFORE);
});

const countRequest = (body: MessagesBody): Request =>
  new Request("https://proxy.test/v1/messages/count_tokens", {
    body: JSON.stringify({
      messages: [{ content: "hi", role: "user" }],
      ...body,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

test("counts the tokens of a prompt without reaching upstream", async () => {
  const response = await app.fetch(countRequest({}));
  const { input_tokens } = countSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(input_tokens).toBeGreaterThan(0);
});

test("counts a system prompt and the tool guide into the total", async () => {
  const [plain, loaded] = await Promise.all([
    app.fetch(countRequest({})),
    app.fetch(countRequest({ system: "be terse", tools: [WEATHER] })),
  ]);
  const small = countSchema.parse(await plain.json());
  const large = countSchema.parse(await loaded.json());
  expect(large.input_tokens).toBeGreaterThan(small.input_tokens);
});

test("accepts a system message from the middle of the conversation", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    messagesRequest({
      messages: [
        { content: "hi", role: "user" },
        { content: "<system-reminder>", role: "system" },
      ],
    })
  );
  expect(response.status).toBe(200);
});
