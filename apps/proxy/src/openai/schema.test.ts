import { expect, test } from "bun:test";

import { chatRequestSchema } from "./schema";

test("accepts a minimal streaming request", () => {
  const result = chatRequestSchema.safeParse({
    messages: [{ content: "hi", role: "user" }],
    model: "gemini-3.1-flash-lite",
    stream: true,
  });
  expect(result.success).toBe(true);
  expect(result.data?.messages?.[0]?.content).toBe("hi");
});

test("leaves a model it does not know to the catalog", () => {
  const result = chatRequestSchema.safeParse({ model: "gpt-4o" });
  expect(result.success).toBe(true);
  expect(result.data?.model).toBe("gpt-4o");
});

test("rejects an empty model", () => {
  const result = chatRequestSchema.safeParse({ model: "" });
  expect(result.success).toBe(false);
  expect(result.error?.issues[0]?.message).toBe(
    "model must not be empty, see GET /v1/models"
  );
});

test("leaves the model undefined so the route can default it", () => {
  const result = chatRequestSchema.safeParse({ messages: [] });
  expect(result.success).toBe(true);
  expect(result.data?.model).toBeUndefined();
});

test("joins array content parts into one string", () => {
  const result = chatRequestSchema.safeParse({
    messages: [
      {
        content: [
          { text: "one", type: "text" },
          { text: "two", type: "text" },
        ],
        role: "user",
      },
    ],
  });
  expect(result.data?.messages?.[0]?.content).toBe("onetwo");
});

test("keeps plain strings inside a content array", () => {
  const result = chatRequestSchema.safeParse({
    messages: [{ content: ["one", "two"], role: "user" }],
  });
  expect(result.data?.messages?.[0]?.content).toBe("onetwo");
});

test("renders a content part without text as an empty string", () => {
  const result = chatRequestSchema.safeParse({
    messages: [
      { content: [{ image_url: "x", type: "image_url" }], role: "user" },
    ],
  });
  expect(result.data?.messages?.[0]?.content).toBe("");
});

test("coerces a missing content to an empty string", () => {
  const result = chatRequestSchema.safeParse({ messages: [{ role: "user" }] });
  expect(result.data?.messages?.[0]?.content).toBe("");
});

test("coerces a non-string content to an empty string", () => {
  const result = chatRequestSchema.safeParse({
    messages: [{ content: 7, role: "user" }],
  });
  expect(result.data?.messages?.[0]?.content).toBe("");
});

test("coerces an unknown role to user", () => {
  const result = chatRequestSchema.safeParse({
    messages: [{ content: "hi", role: "developer" }],
  });
  expect(result.data?.messages?.[0]?.role).toBe("user");
});

test("coerces a missing role to user", () => {
  const result = chatRequestSchema.safeParse({ messages: [{ content: "hi" }] });
  expect(result.data?.messages?.[0]?.role).toBe("user");
});

test("keeps the four known roles", () => {
  const result = chatRequestSchema.safeParse({
    messages: [
      { content: "a", role: "system" },
      { content: "b", role: "user" },
      { content: "c", role: "assistant" },
      { content: "d", role: "tool" },
    ],
  });
  expect(result.data?.messages?.map((m) => m.role)).toEqual([
    "system",
    "user",
    "assistant",
    "tool",
  ]);
});

test("keeps the calls an assistant message made, with parsed arguments", () => {
  const result = chatRequestSchema.safeParse({
    messages: [
      {
        content: null,
        role: "assistant",
        tool_calls: [
          {
            function: { arguments: '{"city":"Bangkok"}', name: "get_weather" },
            id: "call_1",
            type: "function",
          },
          {
            function: { arguments: "not json", name: "get_time" },
            id: "call_2",
            type: "function",
          },
        ],
      },
    ],
  });
  expect(result.data?.messages?.[0]).toEqual({
    calls: [
      { id: "call_1", input: { city: "Bangkok" }, name: "get_weather" },
      { id: "call_2", input: {}, name: "get_time" },
    ],
    content: "",
    role: "assistant",
  });
});

test("keeps the call a tool message answers", () => {
  const result = chatRequestSchema.safeParse({
    messages: [{ content: "sunny", role: "tool", tool_call_id: "call_1" }],
  });
  expect(result.data?.messages?.[0]).toEqual({
    callId: "call_1",
    content: "sunny",
    role: "tool",
  });
});

test("offers function tools under their own names and schemas", () => {
  const result = chatRequestSchema.safeParse({
    messages: [],
    tools: [
      {
        function: {
          description: "Reads the weather.",
          name: "get_weather",
          parameters: { type: "object" },
        },
        type: "function",
      },
    ],
  });
  expect(result.data?.tools).toEqual([
    {
      description: "Reads the weather.",
      inputSchema: { type: "object" },
      name: "get_weather",
    },
  ]);
});
