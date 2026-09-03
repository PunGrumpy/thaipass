import { afterEach, expect, test } from "bun:test";

import { APICallError, NoSuchModelError } from "@ai-sdk/provider";
import type {
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

import {
  DELETE_PATH,
  quotaResponse,
  sseResponse,
  stubUpstream,
  textDeltas,
} from "../testing/upstream";
import type { Upstream } from "../testing/upstream";
import { FENCE_CLOSE, FENCE_OPEN } from "../tools";
import { createAipass } from "./aipass";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const MODEL = "gemini-3.1-flash-lite";

let upstream: Upstream;

const aipass = createAipass({ cookie: COOKIE });

const call = (
  extra: Partial<LanguageModelV2CallOptions> = {}
): LanguageModelV2CallOptions => ({
  prompt: [{ content: [{ text: "hi", type: "text" }], role: "user" }],
  ...extra,
});

const drain = async (
  stream: ReadableStream<LanguageModelV2StreamPart>
): Promise<LanguageModelV2StreamPart[]> => {
  const parts: LanguageModelV2StreamPart[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
};

afterEach(() => {
  upstream.restore();
});

test("exposes the v2 language model contract", () => {
  upstream = stubUpstream(sseResponse([]));
  const model = aipass(MODEL);
  expect(model.specificationVersion).toBe("v2");
  expect(model.provider).toBe("aipass");
  expect(model.modelId).toBe(MODEL);
});

test("rejects a model outside the catalog", () => {
  upstream = stubUpstream(sseResponse([]));
  expect(() => aipass.languageModel("gpt-4o")).toThrow(NoSuchModelError);
});

test("falls back to the free default when no model is named", () => {
  upstream = stubUpstream(sseResponse([]));
  expect(aipass().modelId).toBe("gemini-3.1-flash-lite");
});

test("frames text deltas between a start and an end", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const { stream } = await aipass(MODEL).doStream(call());
  const parts = await drain(stream);
  expect(parts.map((part) => part.type)).toEqual([
    "stream-start",
    "text-start",
    "text-delta",
    "text-delta",
    "text-end",
    "finish",
  ]);
  expect(await upstream.deleted()).toBe(true);
});

test("frames reasoning deltas separately from text", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"reasoning-delta","delta":"think"}',
      '{"type":"text-delta","delta":"say"}',
    ])
  );
  const { stream } = await aipass(MODEL).doStream(call());
  const parts = await drain(stream);
  expect(parts.map((part) => part.type)).toEqual([
    "stream-start",
    "reasoning-start",
    "reasoning-delta",
    "text-start",
    "text-delta",
    "reasoning-end",
    "text-end",
    "finish",
  ]);
});

test("maps the upstream finish reason onto the sdk vocabulary", async () => {
  upstream = stubUpstream(
    sseResponse(['{"type":"finish","finishReason":"length"}'])
  );
  const { stream } = await aipass(MODEL).doStream(call());
  const parts = await drain(stream);
  expect(parts.at(-1)).toEqual({
    finishReason: "length",
    type: "finish",
    usage: {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    },
  });
});

test("falls back to unknown for a finish reason the sdk has no name for", async () => {
  upstream = stubUpstream(
    sseResponse(['{"type":"finish","finishReason":"quota"}'])
  );
  const { stream } = await aipass(MODEL).doStream(call());
  const parts = await drain(stream);
  expect(parts.at(-1)).toMatchObject({ finishReason: "unknown" });
});

test("warns about every sampling setting AI Pass ignores", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const { stream } = await aipass(MODEL).doStream(
    call({ maxOutputTokens: 100, seed: 7, temperature: 0.5 })
  );
  const [first] = await drain(stream);
  expect(first).toEqual({
    type: "stream-start",
    warnings: [
      { setting: "maxOutputTokens", type: "unsupported-setting" },
      { setting: "seed", type: "unsupported-setting" },
      { setting: "temperature", type: "unsupported-setting" },
    ],
  });
});

test("collects the reply as content on a non-streaming call", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"reasoning-delta","delta":"think"}',
      ...textDeltas(2),
      '{"type":"finish","finishReason":"stop"}',
    ])
  );
  const result = await aipass(MODEL).doGenerate(call());
  expect(result.content).toEqual([
    { text: "think", type: "reasoning" },
    { text: "chunk0chunk1", type: "text" },
  ]);
  expect(result.finishReason).toBe("stop");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("throws an api call error and cleans up when upstream is not a stream", async () => {
  upstream = stubUpstream(
    () => new Response("nope", { headers: { "content-type": "text/html" } })
  );
  await expect(aipass(MODEL).doGenerate(call())).rejects.toThrow(APICallError);
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("surfaces an upstream error event as an error part", async () => {
  upstream = stubUpstream(
    sseResponse(['{"type":"error","errorText":"quota exceeded"}'])
  );
  const { stream } = await aipass(MODEL).doStream(call());
  const parts = await drain(stream);
  expect(parts.some((part) => part.type === "error")).toBe(true);
  expect(parts.at(-1)).toMatchObject({ finishReason: "error" });
});

const WEATHER = {
  description: "Reads the weather.",
  inputSchema: { type: "object" },
  name: "get_weather",
  type: "function",
} as const;

const CALL_BLOCK = `${FENCE_OPEN}{"name":"get_weather","input":{"city":"Bangkok"}}${FENCE_CLOSE}`;

test("streams a tool call as a tool-call part and finishes as tool-calls", async () => {
  upstream = stubUpstream(
    sseResponse([
      '{"type":"text-delta","delta":"Checking."}',
      `{"type":"text-delta","delta":${JSON.stringify(`\n${CALL_BLOCK}`)}}`,
    ])
  );
  const { stream } = await aipass(MODEL).doStream(call({ tools: [WEATHER] }));
  const parts = await drain(stream);
  expect(parts.map((part) => part.type)).toEqual([
    "stream-start",
    "text-start",
    "text-delta",
    "text-delta",
    "text-end",
    "tool-call",
    "finish",
  ]);
  expect(parts[5]).toMatchObject({
    input: '{"city":"Bangkok"}',
    toolName: "get_weather",
  });
  expect(parts.at(-1)).toMatchObject({ finishReason: "tool-calls" });
});

test("returns a tool call as content on a non-streaming call", async () => {
  upstream = stubUpstream(
    sseResponse([`{"type":"text-delta","delta":${JSON.stringify(CALL_BLOCK)}}`])
  );
  const result = await aipass(MODEL).doGenerate(call({ tools: [WEATHER] }));
  expect(result.content).toHaveLength(1);
  expect(result.content[0]).toMatchObject({
    input: '{"city":"Bangkok"}',
    toolName: "get_weather",
    type: "tool-call",
  });
  expect(result.finishReason).toBe("tool-calls");
});

test("no longer warns about function tools", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const { stream } = await aipass(MODEL).doStream(call({ tools: [WEATHER] }));
  const [first] = await drain(stream);
  expect(first).toEqual({ type: "stream-start", warnings: [] });
});

const CREDIT_LIMIT = 10_000;
const USED_BEFORE = 100;
const USED_AFTER = 130.25;

test("reports spent credits as provider metadata on generate", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const result = await aipass(MODEL).doGenerate(call());
  expect(result.usage.totalTokens).toBeUndefined();
  expect(result.providerMetadata?.aipass?.credits).toEqual({
    available: CREDIT_LIMIT - USED_AFTER,
    limit: CREDIT_LIMIT,
    reset_at: expect.any(String),
    spent: USED_AFTER - USED_BEFORE,
    used: USED_AFTER,
  });
});

test("reports spent credits on the finish part of a stream", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(1)),
    quotaResponse([USED_BEFORE, USED_AFTER], CREDIT_LIMIT)
  );
  const { stream } = await aipass(MODEL).doStream(call());
  const parts = await drain(stream);
  const finish = parts.find((part) => part.type === "finish");
  expect(finish?.providerMetadata?.aipass?.credits).toMatchObject({
    spent: USED_AFTER - USED_BEFORE,
    used: USED_AFTER,
  });
});

test("leaves provider metadata out when AI Pass reports no credits", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const result = await aipass(MODEL).doGenerate(call());
  expect(result.providerMetadata).toBeUndefined();
});
