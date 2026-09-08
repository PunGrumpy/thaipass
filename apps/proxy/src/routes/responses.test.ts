import { afterEach, expect, test } from "bun:test";

import {
  CONFIRM_PATH,
  CREATE_PATH,
  DELETE_PATH,
  INITIATE_PATH,
  quotaResponse,
  SEND_PREFIX,
  sseResponse,
  stubUpstream,
  textDeltas,
  uploadResponse,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { FENCE_CLOSE, FENCE_OPEN } from "@thaipass/core/tools";
import { z } from "zod";

import { app } from "../app";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

interface ResponsesBody {
  input?: unknown;
  instructions?: string;
  model?: string;
  previous_response_id?: string;
  reasoning?: { effort: string; summary?: string };
  stream?: boolean;
  tools?: readonly unknown[];
}

const responsesRequest = (
  body: ResponsesBody,
  cookie: string = COOKIE
): Request =>
  new Request("https://proxy.test/v1/responses", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${cookie}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

const ask = (extra: ResponsesBody = {}, cookie: string = COOKIE): Request =>
  responsesRequest(
    { input: [{ content: "hi", role: "user", type: "message" }], ...extra },
    cookie
  );

let accounts = 0;
const freshCookie = (): string => {
  accounts += 1;
  return `__Secure-ai_passport_auth.session_token=responses${accounts}.def`;
};

const MODELS_PATH = "/loaders/list-models";

const catalogWith =
  (levels: readonly string[]) =>
  (path: string): Response | undefined =>
    path === MODELS_PATH
      ? Response.json({
          data: [
            {
              id: "gemini-3.1-flash-lite",
              thinkingConfig: { supportedLevels: levels },
            },
          ],
        })
      : undefined;

const errorSchema = z.object({ error: z.object({ message: z.string() }) });

const outputItemSchema = z.object({
  arguments: z.string().optional(),
  call_id: z.string().optional(),
  content: z.array(z.object({ text: z.string(), type: z.string() })).optional(),
  id: z.string(),
  name: z.string().optional(),
  type: z.string(),
});

const modelResponseSchema = z.object({
  created_at: z.number(),
  id: z.string(),
  incomplete_details: z.unknown(),
  object: z.literal("response"),
  output: z.array(outputItemSchema),
  status: z.string(),
  usage: z.object({
    credits: z.object({ spent: z.number().optional() }).optional(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

const eventSchema = z.looseObject({
  sequence_number: z.number(),
  type: z.string(),
});

const eventsOf = (body: string): z.infer<typeof eventSchema>[] =>
  body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => eventSchema.parse(JSON.parse(line.slice("data: ".length))));

const textOf = (response: z.infer<typeof modelResponseSchema>): string =>
  response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .map((part) => part.text)
    .join("");

const sentBody = z.object({
  messages: z.array(
    z.object({ parts: z.array(z.object({ text: z.string() })) })
  ),
  modelId: z.string(),
  thinkingLevel: z.string().optional(),
});

const promptOf = (): string =>
  upstream.bodyOf(SEND_PREFIX, sentBody).messages[0]?.parts[0]?.text ?? "";

test("rejects a request without the session cookie", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    new Request("https://proxy.test/v1/responses", {
      body: JSON.stringify({ input: "hi" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );
  expect(response.status).toBe(401);
});

test("answers buffered by default, as the Responses API does", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(ask());
  const body = modelResponseSchema.parse(await response.json());
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(body.id.startsWith("resp_")).toBe(true);
  expect(body.status).toBe("completed");
  expect(body.incomplete_details).toBeNull();
  expect(textOf(body)).toBe("chunk0chunk1");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("takes a bare string as the whole input", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(responsesRequest({ input: "hi" }));
  expect(response.status).toBe(200);
  expect(promptOf()).toBe("hi");
});

test("streams from response.created to response.completed, with no DONE line", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(ask({ stream: true }));
  const body = await response.text();
  const events = eventsOf(body);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(events.map((event) => event.type)).toEqual([
    "response.created",
    "response.in_progress",
    "response.output_item.added",
    "response.content_part.added",
    "response.output_text.delta",
    "response.output_text.delta",
    "response.output_text.done",
    "response.content_part.done",
    "response.output_item.done",
    "response.completed",
  ]);
  expect(body).toContain("event: response.output_text.delta");
  expect(body).not.toContain("[DONE]");
});

test("numbers every event once, in order, and keeps one response id", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(3)));
  const response = await app.fetch(ask({ stream: true }));
  const events = eventsOf(await response.text());
  expect(events.map((event) => event.sequence_number)).toEqual(
    events.map((_, index) => index)
  );
  const ids = new Set(
    events
      .map((event) => z.object({ id: z.string() }).safeParse(event.response))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data.id)
  );
  expect(ids.size).toBe(1);
});

test("repeats the whole reply on response.completed", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(ask({ stream: true }));
  const events = eventsOf(await response.text());
  const completed = modelResponseSchema.parse(events.at(-1)?.response);
  expect(textOf(completed)).toBe("chunk0chunk1");
  expect(completed.usage.total_tokens).toBeGreaterThan(0);
});

test("deletes the conversation when the client cancels mid-stream", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(30), { pauseMs: 1 }));
  const response = await app.fetch(ask({ stream: true }));
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  await reader?.read();
  await reader?.cancel();
  expect(await upstream.deleted()).toBe(true);
});

test("refuses previous_response_id before anything is sent", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(ask({ previous_response_id: "resp_1" }));
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(400);
  expect(body.error.message).toContain("previous_response_id is not supported");
  expect(upstream.calls).not.toContain(CREATE_PATH);
});

const WEATHER_TOOL = {
  description: "Reads the weather.",
  name: "get_weather",
  parameters: { type: "object" },
  type: "function",
};

const CALL_BLOCK = `${FENCE_OPEN}{"name":"get_weather","input":{"city":"Bangkok"}}${FENCE_CLOSE}`;

const toolCallReply = (): (() => Response) =>
  sseResponse([`{"type":"text-delta","delta":${JSON.stringify(CALL_BLOCK)}}`]);

test("returns a tool call as a function_call item on a buffered reply", async () => {
  upstream = stubUpstream(toolCallReply());
  const response = await app.fetch(ask({ tools: [WEATHER_TOOL] }));
  const body = modelResponseSchema.parse(await response.json());
  const [item] = body.output;
  expect(body.status).toBe("completed");
  expect(item?.type).toBe("function_call");
  expect(item?.name).toBe("get_weather");
  expect(item?.arguments).toBe('{"city":"Bangkok"}');
  expect(item?.call_id?.startsWith("call_")).toBe(true);
  expect(item?.id.startsWith("fc_")).toBe(true);
});

test("streams a tool call as its own output item", async () => {
  upstream = stubUpstream(toolCallReply());
  const response = await app.fetch(
    ask({ stream: true, tools: [WEATHER_TOOL] })
  );
  const events = eventsOf(await response.text());
  expect(events.map((event) => event.type)).toEqual([
    "response.created",
    "response.in_progress",
    "response.output_item.added",
    "response.function_call_arguments.delta",
    "response.function_call_arguments.done",
    "response.output_item.done",
    "response.completed",
  ]);
  const done = z
    .object({ arguments: z.string(), item_id: z.string() })
    .parse(events[4]);
  expect(done.arguments).toBe('{"city":"Bangkok"}');
  expect(done.item_id.startsWith("fc_")).toBe(true);
});

test("names the call the client sent back beside its result in the prompt", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    responsesRequest({
      input: [
        { content: "weather?", role: "user", type: "message" },
        {
          arguments: '{"city":"Bangkok"}',
          call_id: "call_1",
          name: "get_weather",
          type: "function_call",
        },
        { call_id: "call_1", output: "sunny", type: "function_call_output" },
      ],
      instructions: "You are terse.",
      tools: [WEATHER_TOOL],
    })
  );
  const prompt = promptOf();
  expect(response.status).toBe(200);
  expect(prompt).toContain("You are terse.");
  expect(prompt).toContain("You can call tools.");
  expect(prompt).toContain("Tool (get_weather): sunny");
});

test("drops a reasoning item rather than failing on it", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    responsesRequest({
      input: [
        { content: "hi", role: "user", type: "message" },
        {
          id: "rs_1",
          summary: [{ text: "thinking", type: "summary_text" }],
          type: "reasoning",
        },
      ],
    })
  );
  expect(response.status).toBe(200);
  expect(promptOf()).toBe("hi");
});

test("drops a hosted tool rather than offering the model something it cannot run", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    ask({ tools: [{ type: "web_search" }, WEATHER_TOOL] })
  );
  const prompt = promptOf();
  expect(response.status).toBe(200);
  expect(prompt).toContain("get_weather");
  expect(prompt).not.toContain("web_search");
});

test("rounds reasoning.effort minimal down to the lowest level", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    catalogWith(["low", "medium", "high"])
  );
  await app.fetch(
    ask({ reasoning: { effort: "minimal", summary: "auto" } }, freshCookie())
  );
  expect(upstream.bodyOf(SEND_PREFIX, sentBody).thinkingLevel).toBe("low");
});

test("rounds reasoning.effort xhigh up to the highest level", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    catalogWith(["low", "medium", "high", "max"])
  );
  await app.fetch(ask({ reasoning: { effort: "xhigh" } }, freshCookie()));
  expect(upstream.bodyOf(SEND_PREFIX, sentBody).thinkingLevel).toBe("max");
});

test("asks for no thinking when the effort is none", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  await app.fetch(ask({ reasoning: { effort: "none" } }));
  expect(upstream.bodyOf(SEND_PREFIX, sentBody).thinkingLevel).toBeUndefined();
});

test("uploads an input_image as an attachment", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)), uploadResponse());
  const response = await app.fetch(
    responsesRequest({
      input: [
        {
          content: [
            { text: "what is this", type: "input_text" },
            {
              image_url: "data:image/png;base64,aGk=",
              type: "input_image",
            },
          ],
          role: "user",
          type: "message",
        },
      ],
    })
  );
  expect(response.status).toBe(200);
  expect(upstream.calls).toContain(INITIATE_PATH);
  expect(upstream.calls).toContain(CONFIRM_PATH);
});

const CREDIT_LIMIT = 10_000;
const USED_BEFORE = 100;
const USED_AFTER = 130.25;

test("reports the credits the reply spent in usage", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const response = await app.fetch(ask());
  const body = modelResponseSchema.parse(await response.json());
  expect(body.usage.credits?.spent).toBe(USED_AFTER - USED_BEFORE);
});

test("reports the credits on the response.completed event of a stream", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const response = await app.fetch(ask({ stream: true }));
  const events = eventsOf(await response.text());
  const completed = modelResponseSchema.parse(events.at(-1)?.response);
  expect(completed.usage.credits?.spent).toBe(USED_AFTER - USED_BEFORE);
});

test("returns 502 and deletes the conversation when upstream is not a stream", async () => {
  upstream = stubUpstream(
    () =>
      new Response("<html>sign in</html>", {
        headers: { "content-type": "text/html", location: "/auth/sign-in" },
        status: 302,
      })
  );
  const response = await app.fetch(ask({ stream: true }));
  expect(response.status).toBe(502);
  expect(upstream.calls).toContain(DELETE_PATH);
});
