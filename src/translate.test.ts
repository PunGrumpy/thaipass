import { expect, test } from "bun:test";

import { FENCE_CLOSE, FENCE_OPEN } from "./tools";
import type { ToolDefinition } from "./tools";
import { toAipassMessages } from "./translate";
import type { ChatTurn, Conversation } from "./translate";

const MODEL = "gemini-3.1-flash-lite";

const flatten = (turns: ChatTurn[], tools: ToolDefinition[] = []): string => {
  const [message] = toAipassMessages({ tools, turns }, MODEL);
  return message?.parts[0]?.text ?? "";
};

test("wraps the conversation in one user message tagged with the model", () => {
  const [message] = toAipassMessages(
    { tools: [], turns: [{ content: "hi", role: "user" }] },
    MODEL
  );
  expect(message?.role).toBe("user");
  expect(message?.metadata.modelId).toBe(MODEL);
  expect(message?.parts).toHaveLength(1);
  expect(message?.parts[0]?.type).toBe("text");
});

test("gives each call a fresh message id", () => {
  const conversation: Conversation = {
    tools: [],
    turns: [{ content: "hi", role: "user" }],
  };
  const [first] = toAipassMessages(conversation, MODEL);
  const [second] = toAipassMessages(conversation, MODEL);
  expect(first?.id).not.toBe(second?.id);
});

test("passes a lone user turn through unlabelled", () => {
  expect(flatten([{ content: "what is AI?", role: "user" }])).toBe(
    "what is AI?"
  );
});

test("keeps a lone user turn verbatim including its whitespace", () => {
  expect(flatten([{ content: "  padded  ", role: "user" }])).toBe("  padded  ");
});

test("puts the system prompt ahead of a labelled user turn", () => {
  expect(
    flatten([
      { content: "be terse", role: "system" },
      { content: "hi", role: "user" },
    ])
  ).toBe("be terse\n\nUser: hi");
});

test("joins several system prompts before the conversation", () => {
  expect(
    flatten([
      { content: "one", role: "system" },
      { content: "two", role: "system" },
      { content: "hi", role: "user" },
    ])
  ).toBe("one\n\ntwo\n\nUser: hi");
});

test("labels each turn of a multi-turn conversation", () => {
  expect(
    flatten([
      { content: "hi", role: "user" },
      { content: "hello", role: "assistant" },
      { content: "again", role: "user" },
    ])
  ).toBe("User: hi\n\nAssistant: hello\n\nUser: again");
});

test("labels tool turns as Tool", () => {
  expect(
    flatten([
      { content: "hi", role: "user" },
      { content: "42", role: "tool" },
    ])
  ).toBe("User: hi\n\nTool: 42");
});

test("drops blank turns", () => {
  expect(
    flatten([
      { content: "hi", role: "user" },
      { content: "   ", role: "assistant" },
      { content: "again", role: "user" },
    ])
  ).toBe("User: hi\n\nUser: again");
});

test("returns an empty body when nothing survives", () => {
  expect(flatten([])).toBe("");
});

test("returns the system prompt alone when there is no conversation", () => {
  expect(flatten([{ content: "be terse", role: "system" }])).toBe("be terse");
});

const WEATHER: ToolDefinition = {
  description: "Reads the weather.",
  inputSchema: { properties: { city: { type: "string" } }, type: "object" },
  name: "get_weather",
};

test("labels a lone user turn once tools are offered", () => {
  const text = flatten([{ content: "hi", role: "user" }], [WEATHER]);
  expect(text).toContain("You can call tools.");
  expect(text).toContain(
    '- get_weather: Reads the weather.\n  input schema: {"properties"'
  );
  expect(text.endsWith("User: hi")).toBe(true);
});

test("puts the tool guide between the system prompt and the conversation", () => {
  const text = flatten(
    [
      { content: "be terse", role: "system" },
      { content: "hi", role: "user" },
    ],
    [WEATHER]
  );
  expect(text.startsWith("be terse\n\nYou can call tools.")).toBe(true);
  expect(text.endsWith("\n\nUser: hi")).toBe(true);
});

test("renders past calls in the fence the model is asked to use", () => {
  const text = flatten(
    [
      { content: "weather?", role: "user" },
      {
        calls: [{ id: "c1", input: { city: "Bangkok" }, name: "get_weather" }],
        content: "Checking.",
        role: "assistant",
      },
    ],
    [WEATHER]
  );
  expect(text).toContain(
    `Assistant: Checking.\n\n${FENCE_OPEN}{"input":{"city":"Bangkok"},"name":"get_weather"}${FENCE_CLOSE}`
  );
});

test("names the tool a result answers", () => {
  const text = flatten([
    { content: "weather?", role: "user" },
    {
      calls: [{ id: "c1", input: {}, name: "get_weather" }],
      content: "",
      role: "assistant",
    },
    { callId: "c1", content: "sunny", role: "tool" },
  ]);
  expect(text).toContain("Tool (get_weather): sunny");
});
