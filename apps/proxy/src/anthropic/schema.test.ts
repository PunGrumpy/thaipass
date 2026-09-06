import { expect, test } from "bun:test";

import type { z } from "zod";

import { messagesRequestSchema, toConversation, toThinking } from "./schema";

type MessagesInput = z.input<typeof messagesRequestSchema>;

const parse = (body: MessagesInput) => {
  const result = messagesRequestSchema.safeParse(body);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return toConversation(result.data);
};

test("turns a string system prompt into a system turn", () => {
  const { turns } = parse({
    messages: [{ content: "hi", role: "user" }],
    system: "be terse",
  });
  expect(turns).toEqual([
    { content: "be terse", role: "system" },
    { content: "hi", role: "user" },
  ]);
});

test("joins the text blocks of a system prompt array", () => {
  const { turns } = parse({
    messages: [],
    system: [
      { text: "one", type: "text" },
      { text: "two", type: "text" },
    ],
  });
  expect(turns).toEqual([{ content: "onetwo", role: "system" }]);
});

test("leaves the model undefined so the route can default it", () => {
  const result = messagesRequestSchema.safeParse({ messages: [] });
  expect(result.success).toBe(true);
  expect(result.data?.model).toBeUndefined();
});

test("leaves a model it does not know to the catalog, and rejects only an empty one", () => {
  const unknown = messagesRequestSchema.safeParse({ model: "claude-3-opus" });
  expect(unknown.success).toBe(true);
  const empty = messagesRequestSchema.safeParse({ model: "" });
  expect(empty.success).toBe(false);
});

test("joins the text blocks of a message and carries the image beside them", () => {
  const { turns } = parse({
    messages: [
      {
        content: [
          { text: "look", type: "text" },
          {
            source: { data: "aGk=", media_type: "image/png", type: "base64" },
            type: "image",
          },
          { text: " here", type: "text" },
        ],
        role: "user",
      },
    ],
  });
  expect(turns).toEqual([
    {
      content: "look here",
      files: [{ filename: undefined, uri: "data:image/png;base64,aGk=" }],
      role: "user",
    },
  ]);
});

test("carries a document block the same way an image is carried", () => {
  const { turns } = parse({
    messages: [
      {
        content: [
          {
            source: {
              data: "JVBERi0=",
              media_type: "application/pdf",
              type: "base64",
            },
            title: "report.pdf",
            type: "document",
          },
        ],
        role: "user",
      },
    ],
  });
  expect(turns[0]?.files).toEqual([
    { filename: "report.pdf", uri: "data:application/pdf;base64,JVBERi0=" },
  ]);
});

test("keeps the calls an assistant turn made", () => {
  const { turns } = parse({
    messages: [
      {
        content: [
          { text: "Checking.", type: "text" },
          {
            id: "toolu_1",
            input: { city: "Bangkok" },
            name: "get_weather",
            type: "tool_use",
          },
        ],
        role: "assistant",
      },
    ],
  });
  expect(turns).toEqual([
    {
      calls: [
        { id: "toolu_1", input: { city: "Bangkok" }, name: "get_weather" },
      ],
      content: "Checking.",
      role: "assistant",
    },
  ]);
});

test("splits a user message into tool turns and the user's own words", () => {
  const { turns } = parse({
    messages: [
      {
        content: [
          { content: "sunny", tool_use_id: "toolu_1", type: "tool_result" },
          {
            content: [{ text: "warm", type: "text" }],
            tool_use_id: "toolu_2",
            type: "tool_result",
          },
          { text: "thanks", type: "text" },
        ],
        role: "user",
      },
    ],
  });
  expect(turns).toEqual([
    { callId: "toolu_1", content: "sunny", role: "tool" },
    { callId: "toolu_2", content: "warm", role: "tool" },
    { content: "thanks", role: "user" },
  ]);
});

test("adds no user turn when a message holds only results", () => {
  const { turns } = parse({
    messages: [
      {
        content: [
          { content: "sunny", tool_use_id: "toolu_1", type: "tool_result" },
        ],
        role: "user",
      },
    ],
  });
  expect(turns).toEqual([
    { callId: "toolu_1", content: "sunny", role: "tool" },
  ]);
});

test("offers the tools under their own names and schemas", () => {
  const { tools } = parse({
    messages: [],
    tools: [
      {
        description: "Reads the weather.",
        input_schema: { type: "object" },
        name: "get_weather",
      },
    ],
  });
  expect(tools).toEqual([
    {
      description: "Reads the weather.",
      inputSchema: { type: "object" },
      name: "get_weather",
    },
  ]);
});

test("ignores the fields AI Pass has no use for", () => {
  const result = messagesRequestSchema.safeParse({
    max_tokens: 1024,
    messages: [],
    metadata: { user_id: "u1" },
    temperature: 0.2,
    thinking: { budget_tokens: 1024, type: "enabled" },
  });
  expect(result.success).toBe(true);
  expect(result.data).not.toHaveProperty("temperature");
});

test("keeps a system message from the middle of the conversation", () => {
  const { turns } = parse({
    messages: [
      { content: "hi", role: "user" },
      {
        content: [{ text: "<system-reminder>", type: "text" }],
        role: "system",
      },
    ],
    system: "be terse",
  });
  expect(turns).toEqual([
    { content: "be terse", role: "system" },
    { content: "hi", role: "user" },
    { content: "<system-reminder>", role: "system" },
  ]);
});

const thinkingOf = (body: MessagesInput) => {
  const result = messagesRequestSchema.safeParse(body);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return toThinking(result.data);
};

test("takes an adaptive thinking block with the effort as its level", () => {
  expect(
    thinkingOf({
      messages: [],
      output_config: { effort: "high" },
      thinking: { type: "adaptive" },
    })
  ).toBe("high");
});

test("rounds xhigh down to high and passes max through", () => {
  expect(
    thinkingOf({
      messages: [],
      output_config: { effort: "xhigh" },
      thinking: { type: "adaptive" },
    })
  ).toBe("high");
  expect(
    thinkingOf({
      messages: [],
      output_config: { effort: "max" },
      thinking: { type: "adaptive" },
    })
  ).toBe("max");
});

test("defaults an adaptive block without an effort to medium", () => {
  expect(thinkingOf({ messages: [], thinking: { type: "adaptive" } })).toBe(
    "medium"
  );
});

test("lets the effort win over a budget on an enabled block", () => {
  expect(
    thinkingOf({
      messages: [],
      output_config: { effort: "low" },
      thinking: { budget_tokens: 32_000, type: "enabled" },
    })
  ).toBe("low");
  expect(
    thinkingOf({
      messages: [],
      thinking: { budget_tokens: 32_000, type: "enabled" },
    })
  ).toBe("high");
});

test("leaves thinking off when the block is disabled or missing", () => {
  expect(
    thinkingOf({
      messages: [],
      output_config: { effort: "high" },
      thinking: { type: "disabled" },
    })
  ).toBeUndefined();
  expect(
    thinkingOf({ messages: [], output_config: { effort: "high" } })
  ).toBeUndefined();
});

test("ignores the display setting on a thinking block", () => {
  expect(
    messagesRequestSchema.safeParse({
      messages: [],
      thinking: { display: "summarized", type: "adaptive" },
    }).success
  ).toBe(true);
});
