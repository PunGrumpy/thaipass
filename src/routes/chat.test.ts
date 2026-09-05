import { afterEach, expect, test } from "bun:test";

import { z } from "zod";

import { app } from "../app";
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
} from "../testing/upstream";
import type { Upstream } from "../testing/upstream";
import { FENCE_CLOSE, FENCE_OPEN } from "../tools";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const FRAME_GAP_MS = 1;
const SECOND_CROSSING_MS = 700;

let upstream: Upstream;

/** The request fields a test varies on top of a plain one-message body. */
interface ChatBodyExtras {
  model?: string;
  reasoning_effort?: string;
  thinking_level?: string;
}

const chatRequest = (
  stream: boolean,
  extra: ChatBodyExtras = {},
  cookie: string = COOKIE
): Request =>
  new Request("https://proxy.test/v1/chat/completions", {
    body: JSON.stringify({
      messages: [{ content: "hi", role: "user" }],
      stream,
      ...extra,
    }),
    headers: {
      authorization: `Bearer ${cookie}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

/**
 * The catalog is cached per account for five minutes, so a test that depends on
 * what the catalog said needs an account of its own or it reads the last one's.
 */
let accounts = 0;
const freshCookie = (): string => {
  accounts += 1;
  return `__Secure-ai_passport_auth.session_token=catalog${accounts}.def`;
};

const errorSchema = z.object({
  error: z.object({ message: z.string() }),
});

const chunkSchema = z.object({
  choices: z.array(z.object({ logprobs: z.null() })),
  created: z.number(),
});

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

const creditsSchema = z.object({
  available: z.number(),
  limit: z.number(),
  reset_at: z.string(),
  spent: z.number().optional(),
  used: z.number(),
});

const usageSchema = z.object({
  usage: z.object({
    credits: creditsSchema.optional(),
    total_tokens: z.number(),
  }),
});

const CREDIT_LIMIT = 10_000;
const USED_BEFORE = 100;
const USED_AFTER = 130.25;

afterEach(() => {
  upstream.restore();
});

test("rejects a request without the session cookie", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    new Request("https://proxy.test/v1/chat/completions", {
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );
  expect(response.status).toBe(401);
});

test("tells a caller who sent only the token what to send instead", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    new Request("https://proxy.test/v1/chat/completions", {
      body: JSON.stringify({ messages: [] }),
      headers: {
        authorization: "Bearer jMgaPqgp9D0H9FErUXCpPpMf",
        "content-type": "application/json",
      },
      method: "POST",
    })
  );
  const body = errorSchema.parse(await response.json());
  expect(response.status).toBe(401);
  expect(body.error.message).toContain("whole Cookie header");
  expect(body.error.message).not.toContain("jMgaPqgp9D0H9FErUXCpPpMf");
});

test("streams the upstream deltas as openai chunks", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(chatRequest(true));
  const text = await response.text();
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(text).toContain('"content":"chunk0"');
  expect(text).toContain('"content":"chunk1"');
  expect(text).toContain("data: [DONE]");
  expect(await upstream.deleted()).toBe(true);
});

test("stamps every chunk of one stream with the same created", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(2), { pauseMs: SECOND_CROSSING_MS })
  );
  const response = await app.fetch(chatRequest(true));
  const text = await response.text();
  const stamps = new Set(
    text
      .split("\n")
      .filter((line) => line.startsWith("data: {"))
      .map((line) => chunkSchema.parse(JSON.parse(line.slice(6))).created)
  );
  expect(stamps.size).toBe(1);
});

test("carries the null logprobs openai sends", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(chatRequest(true));
  const body = await response.text();
  const first = body.split("\n").find((line) => line.startsWith("data: {"));
  expect(
    chunkSchema.parse(JSON.parse(first?.slice(6) ?? "{}")).choices[0]
  ).toHaveProperty("logprobs", null);
});

test("deletes the conversation when the client cancels mid-stream", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(30), { pauseMs: FRAME_GAP_MS })
  );
  const response = await app.fetch(chatRequest(true));
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  await reader?.read();
  await reader?.cancel();
  expect(await upstream.deleted()).toBe(true);
});

test("deletes the conversation after a buffered completion", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  expect(body.choices[0]?.message.content).toBe("chunk0chunk1");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("returns 502 and deletes the conversation when upstream is not a stream", async () => {
  upstream = stubUpstream(
    () =>
      new Response("<html>sign in</html>", {
        headers: { "content-type": "text/html", location: "/auth/sign-in" },
        status: 302,
      })
  );
  const response = await app.fetch(chatRequest(true));
  expect(response.status).toBe(502);
  expect(upstream.calls).toContain(DELETE_PATH);
});

const MODELS_PATH = "/loaders/list-models";

interface CatalogEntryPayload {
  id: string;
  thinkingConfig?: { supportedLevels: readonly string[] };
}

const catalogEntry = (
  thinking: readonly string[] | null
): CatalogEntryPayload => {
  const entry: CatalogEntryPayload = { id: "claude-opus-5@azure" };
  if (thinking) {
    entry.thinkingConfig = { supportedLevels: thinking };
  }
  return entry;
};

const catalogResponse =
  (thinking: readonly string[] | null) =>
  (path: string): Response | undefined =>
    path === MODELS_PATH
      ? Response.json({ data: [catalogEntry(thinking)] })
      : undefined;

const sentBody = z.object({
  modelId: z.string(),
  thinkingLevel: z.string().optional(),
});

test("sends a thinking level the model advertises", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    catalogResponse(["low", "medium", "high", "max"])
  );
  const response = await app.fetch(
    chatRequest(false, { model: "claude-opus-5@azure", thinking_level: "max" })
  );
  expect(response.status).toBe(200);
  expect(upstream.bodyOf(SEND_PREFIX, sentBody).thinkingLevel).toBe("max");
});

test("drops a thinking level the model does not advertise, and answers anyway", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    catalogResponse(["low", "medium"])
  );
  const response = await app.fetch(
    chatRequest(
      false,
      { model: "claude-opus-5@azure", thinking_level: "max" },
      freshCookie()
    )
  );
  expect(response.status).toBe(200);
  expect(upstream.bodyOf(SEND_PREFIX, sentBody).thinkingLevel).toBeUndefined();
});

test("accepts reasoning_effort as the name an OpenAI client already sends", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)), catalogResponse(null));
  await app.fetch(
    chatRequest(false, { reasoning_effort: "minimal" }, freshCookie())
  );
  expect(upstream.bodyOf(SEND_PREFIX, sentBody).thinkingLevel).toBe("low");
});

test("sends no thinking level when the caller asked for none", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    catalogResponse(["low", "medium", "high"])
  );
  const response = await app.fetch(chatRequest(false, {}, freshCookie()));
  expect(response.status).toBe(200);
  expect(upstream.bodyOf(SEND_PREFIX, sentBody).thinkingLevel).toBeUndefined();
});

const GENERATED_PATH = "/files/generated.png";

const fileFrame = (extra: string): string =>
  `{"type":"file","mediaType":"image/png","filename":"cat.png"${extra}}`;

test("carries a generated image back inline, reading it with the cookie", async () => {
  upstream = stubUpstream(
    sseResponse([fileFrame(`,"url":"${GENERATED_PATH}"`)]),
    (path) =>
      path === GENERATED_PATH
        ? new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
          })
        : undefined
  );
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  expect(upstream.calls).toContain(GENERATED_PATH);
  expect(body.choices[0]?.message.content).toContain(
    "![cat.png](data:image/png;base64,iVBORw==)"
  );
});

test("reads a video's snapshotUrl, which is the only url a video frame carries", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"file","mediaType":"video/mp4","filename":"clip.mp4","snapshotUrl":"/files/clip.mp4"}',
    ]),
    (path) =>
      path === "/files/clip.mp4"
        ? new Response(new Uint8Array([0, 1]), {
            headers: { "content-type": "video/mp4" },
          })
        : undefined
  );
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  expect(body.choices[0]?.message.content).toContain(
    "[clip.mp4](data:video/mp4"
  );
});

test("reads the nested data object some models put the file under", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"file","data":{"mediaType":"image/png","filename":"nested.png","url":"data:image/png;base64,aGk="}}',
    ])
  );
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  expect(body.choices[0]?.message.content).toContain(
    "![nested.png](data:image/png;base64,aGk=)"
  );
});

test("hands back a link, and says why, when the file cannot be read", async () => {
  upstream = stubUpstream(
    sseResponse([fileFrame(`,"url":"${GENERATED_PATH}"`)]),
    (path) =>
      path === GENERATED_PATH
        ? new Response("gone", { status: 404 })
        : undefined
  );
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  const content = body.choices[0]?.message.content ?? "";
  expect(content).toContain("could not read the file (404)");
  expect(content).toContain("logged-in browser");
});

test("leaves an off-origin file as the link it already is", async () => {
  upstream = stubUpstream(
    sseResponse([fileFrame(',"url":"https://cdn.test/cat.png"')])
  );
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  expect(body.choices[0]?.message.content).toContain(
    "![cat.png](https://cdn.test/cat.png)"
  );
  expect(upstream.calls).not.toContain("https://cdn.test/cat.png");
});

const PNG_DATA_URI = "data:image/png;base64,aGk=";

const filePart = {
  image_url: { url: PNG_DATA_URI },
  type: "image_url",
};

const attachmentRequest = (): Request =>
  new Request("https://proxy.test/v1/chat/completions", {
    body: JSON.stringify({
      messages: [
        {
          content: [{ text: "what is this", type: "text" }, filePart],
          role: "user",
        },
      ],
      stream: false,
    }),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

const partsSchema = z.object({
  messages: z.array(
    z.object({
      parts: z.array(
        z.object({
          filename: z.string().optional(),
          mediaType: z.string().optional(),
          storageKey: z.string().optional(),
          text: z.string().optional(),
          type: z.string(),
          url: z.string().optional(),
        })
      ),
    })
  ),
});

test("uploads an attachment and puts its storage key on the turn", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)), uploadResponse());
  const response = await app.fetch(attachmentRequest());
  expect(response.status).toBe(200);
  expect(upstream.calls).toContain(INITIATE_PATH);
  expect(upstream.calls).toContain(CONFIRM_PATH);
  const parts = upstream.bodyOf(SEND_PREFIX, partsSchema).messages[0]?.parts;
  expect(parts?.[0]).toEqual({
    filename: "image-1.png",
    mediaType: "image/png",
    storageKey: "uploads/abc123",
    type: "file",
    url: "uploads/abc123",
  });
  expect(parts?.[1]?.text).toBe("what is this");
});

test("uploads only after the conversation exists, since initiate is scoped to it", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)), uploadResponse());
  await app.fetch(attachmentRequest());
  expect(upstream.calls.indexOf(CREATE_PATH)).toBeLessThan(
    upstream.calls.indexOf(INITIATE_PATH)
  );
  expect(upstream.calls.indexOf(INITIATE_PATH)).toBeLessThan(
    upstream.calls.findIndex((path) => path.startsWith(SEND_PREFIX))
  );
});

test("refuses a remote attachment url rather than fetching it", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)), uploadResponse());
  const response = await app.fetch(
    new Request("https://proxy.test/v1/chat/completions", {
      body: JSON.stringify({
        messages: [
          {
            content: [
              {
                image_url: { url: "https://evil.test/x.png" },
                type: "image_url",
              },
            ],
            role: "user",
          },
        ],
      }),
      headers: {
        authorization: `Bearer ${COOKIE}`,
        "content-type": "application/json",
      },
      method: "POST",
    })
  );
  expect(response.status).toBe(400);
  const body = errorSchema.parse(await response.json());
  expect(body.error.message).toContain("only inline data is accepted");
  expect(upstream.calls).not.toContain(INITIATE_PATH);
});

test("fails the request when the upload is refused, naming the step", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)), (path) =>
    path === INITIATE_PATH
      ? new Response("no room", { status: 507 })
      : uploadResponse()(path)
  );
  const response = await app.fetch(attachmentRequest());
  expect(response.status).toBe(400);
  const body = errorSchema.parse(await response.json());
  expect(body.error.message).toContain("upload initiate returned 507");
});

const EDGE_REFUSAL_BODY = "<html>Request blocked</html>";

const edgeRefusal = (): Response =>
  new Response(EDGE_REFUSAL_BODY, {
    headers: { "content-type": "text/html" },
    status: 403,
  });

test("reports an edge refusal on send as a 400 the caller can act on", async () => {
  upstream = stubUpstream(edgeRefusal);
  const response = await app.fetch(chatRequest(true));
  expect(response.status).toBe(400);
  const body = z
    .object({ error: z.object({ detail: z.string(), message: z.string() }) })
    .parse(await response.json());
  expect(body.error.message).toContain("upstream 403");
  expect(body.error.message).toContain("before the model ran");
  expect(body.error.detail).toContain("Request blocked");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("stops at an edge refusal on create rather than addressing a conversation that was never opened", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)), (path) =>
    path === CREATE_PATH ? edgeRefusal() : undefined
  );
  const response = await app.fetch(chatRequest(true));
  expect(response.status).toBe(400);
  expect(upstream.calls).toContain(CREATE_PATH);
  expect(upstream.calls.some((path) => path.startsWith(SEND_PREFIX))).toBe(
    false
  );
  expect(upstream.calls).not.toContain(DELETE_PATH);
});

const WEATHER_TOOL = {
  function: {
    description: "Reads the weather.",
    name: "get_weather",
    parameters: { type: "object" },
  },
  type: "function",
};

const CALL_BLOCK = `${FENCE_OPEN}{"name":"get_weather","input":{"city":"Bangkok"}}${FENCE_CLOSE}`;

const toolRequest = (stream: boolean): Request =>
  new Request("https://proxy.test/v1/chat/completions", {
    body: JSON.stringify({
      messages: [{ content: "weather?", role: "user" }],
      stream,
      tools: [WEATHER_TOOL],
    }),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

const toolCompletionSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string(),
      message: z.object({
        content: z.string().nullable(),
        tool_calls: z
          .array(
            z.object({
              function: z.object({ arguments: z.string(), name: z.string() }),
              id: z.string(),
              type: z.literal("function"),
            })
          )
          .optional(),
      }),
    })
  ),
});

test("returns a tool call as tool_calls on a buffered completion", async () => {
  upstream = stubUpstream(
    sseResponse([`{"type":"text-delta","delta":${JSON.stringify(CALL_BLOCK)}}`])
  );
  const response = await app.fetch(toolRequest(false));
  const body = toolCompletionSchema.parse(await response.json());
  const [choice] = body.choices;
  expect(choice?.finish_reason).toBe("tool_calls");
  expect(choice?.message.content).toBeNull();
  expect(choice?.message.tool_calls?.[0]?.function).toEqual({
    arguments: '{"city":"Bangkok"}',
    name: "get_weather",
  });
  expect(choice?.message.tool_calls?.[0]?.id.startsWith("call_")).toBe(true);
});

test("streams a tool call as a tool_calls delta", async () => {
  upstream = stubUpstream(
    sseResponse([`{"type":"text-delta","delta":${JSON.stringify(CALL_BLOCK)}}`])
  );
  const response = await app.fetch(toolRequest(true));
  const text = await response.text();
  expect(text).toContain(
    '"tool_calls":[{"function":{"arguments":"{\\"city\\":\\"Bangkok\\"}","name":"get_weather"},"id":"call_'
  );
  expect(text).toContain('"finish_reason":"tool_calls"');
  expect(text).toContain("data: [DONE]");
});

test("renders past tool calls and results into the prompt", async () => {
  let sent = "";
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const realFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/actions/send-message/")) {
        sent = String(init?.body ?? "");
      }
      return realFetch(input, init);
    },
    { preconnect: realFetch.preconnect }
  );
  const response = await app.fetch(
    new Request("https://proxy.test/v1/chat/completions", {
      body: JSON.stringify({
        messages: [
          { content: "weather?", role: "user" },
          {
            content: null,
            role: "assistant",
            tool_calls: [
              {
                function: {
                  arguments: '{"city":"Bangkok"}',
                  name: "get_weather",
                },
                id: "call_1",
                type: "function",
              },
            ],
          },
          { content: "sunny", role: "tool", tool_call_id: "call_1" },
        ],
        stream: false,
        tools: [WEATHER_TOOL],
      }),
      headers: {
        authorization: `Bearer ${COOKIE}`,
        "content-type": "application/json",
      },
      method: "POST",
    })
  );
  globalThis.fetch = realFetch;
  expect(response.status).toBe(200);
  expect(sent).toContain("You can call tools.");
  expect(sent).toContain("Tool (get_weather): sunny");
});

test("reports the credits a buffered completion spent in its usage", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const response = await app.fetch(chatRequest(false));
  const { usage } = usageSchema.parse(await response.json());
  expect(usage.total_tokens).toBeGreaterThan(0);
  expect(usage.credits).toEqual({
    available: CREDIT_LIMIT - USED_AFTER,
    limit: CREDIT_LIMIT,
    reset_at: expect.any(String),
    spent: USED_AFTER - USED_BEFORE,
    used: USED_AFTER,
  });
});

test("reports the credits on the final chunk of a stream", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(2)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const response = await app.fetch(chatRequest(true));
  const text = await response.text();
  const frames = text
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => usageSchema.partial().parse(JSON.parse(line.slice(6))));
  const withUsage = frames.filter((frame) => frame.usage !== undefined);
  expect(withUsage).toHaveLength(1);
  expect(withUsage[0]?.usage?.credits?.spent).toBe(USED_AFTER - USED_BEFORE);
  expect(frames.at(-1)?.usage?.credits?.used).toBe(USED_AFTER);
});

test("leaves credits out of usage when AI Pass reports none", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(chatRequest(false));
  const { usage } = usageSchema.parse(await response.json());
  expect(usage.credits).toBeUndefined();
});
