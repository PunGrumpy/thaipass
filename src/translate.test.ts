import { expect, test } from "bun:test";

import type { OpenAIMessage } from "./openai/schema";
import { toAipassMessages } from "./translate";

const MODEL = "gemini-3.1-flash-lite";

const flatten = (messages: OpenAIMessage[]): string => {
  const [message] = toAipassMessages(messages, MODEL);
  return message?.parts[0]?.text ?? "";
};

test("wraps the conversation in one user message tagged with the model", () => {
  const [message] = toAipassMessages([{ content: "hi", role: "user" }], MODEL);
  expect(message?.role).toBe("user");
  expect(message?.metadata.modelId).toBe(MODEL);
  expect(message?.parts).toHaveLength(1);
  expect(message?.parts[0]?.type).toBe("text");
});

test("gives each call a fresh message id", () => {
  const [first] = toAipassMessages([{ content: "hi", role: "user" }], MODEL);
  const [second] = toAipassMessages([{ content: "hi", role: "user" }], MODEL);
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
