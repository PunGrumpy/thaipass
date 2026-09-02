import { expect, test } from "bun:test";

import { convertPrompt } from "./prompt";

test("keeps a system message as plain text", () => {
  const { messages, warnings } = convertPrompt([
    { content: "be terse", role: "system" },
  ]);
  expect(messages).toEqual([{ content: "be terse", role: "system" }]);
  expect(warnings).toEqual([]);
});

test("joins the text parts of a user turn", () => {
  const { messages } = convertPrompt([
    {
      content: [
        { text: "one", type: "text" },
        { text: "two", type: "text" },
      ],
      role: "user",
    },
  ]);
  expect(messages).toEqual([{ content: "onetwo", role: "user" }]);
});

test("keeps assistant reasoning alongside its text", () => {
  const { messages } = convertPrompt([
    {
      content: [
        { text: "thinking", type: "reasoning" },
        { text: "answer", type: "text" },
      ],
      role: "assistant",
    },
  ]);
  expect(messages).toEqual([{ content: "thinkinganswer", role: "assistant" }]);
});

test("warns once naming every part type it dropped", () => {
  const { messages, warnings } = convertPrompt([
    {
      content: [
        { text: "look", type: "text" },
        { data: "aGk=", mediaType: "image/png", type: "file" },
      ],
      role: "user",
    },
    {
      content: [{ data: "aGk=", mediaType: "application/pdf", type: "file" }],
      role: "user",
    },
  ]);
  expect(messages).toEqual([
    { content: "look", role: "user" },
    { content: "", role: "user" },
  ]);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toEqual({
    message: "the provider dropped file parts because AI Pass reads text only",
    type: "other",
  });
});

test("drops tool results and says so", () => {
  const { messages, warnings } = convertPrompt([
    {
      content: [
        {
          output: { type: "text", value: "sunny" },
          toolCallId: "call_1",
          toolName: "weather",
          type: "tool-result",
        },
      ],
      role: "tool",
    },
  ]);
  expect(messages).toEqual([{ content: "", role: "tool" }]);
  expect(warnings[0]?.type).toBe("other");
});

test("returns nothing for an empty prompt", () => {
  expect(convertPrompt([])).toEqual({ messages: [], warnings: [] });
});
