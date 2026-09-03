import { expect, test } from "bun:test";

import { convertPrompt, convertTools } from "./prompt";

test("keeps a system message as plain text", () => {
  const { turns, warnings } = convertPrompt([
    { content: "be terse", role: "system" },
  ]);
  expect(turns).toEqual([{ content: "be terse", role: "system" }]);
  expect(warnings).toEqual([]);
});

test("joins the text parts of a user turn", () => {
  const { turns } = convertPrompt([
    {
      content: [
        { text: "one", type: "text" },
        { text: "two", type: "text" },
      ],
      role: "user",
    },
  ]);
  expect(turns).toEqual([{ content: "onetwo", role: "user" }]);
});

test("keeps assistant reasoning alongside its text", () => {
  const { turns } = convertPrompt([
    {
      content: [
        { text: "thinking", type: "reasoning" },
        { text: "answer", type: "text" },
      ],
      role: "assistant",
    },
  ]);
  expect(turns).toEqual([{ content: "thinkinganswer", role: "assistant" }]);
});

test("warns once naming every part type it dropped", () => {
  const { turns, warnings } = convertPrompt([
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
  expect(turns).toEqual([
    { content: "look", role: "user" },
    { content: "", role: "user" },
  ]);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toEqual({
    message: "the provider dropped file parts because AI Pass reads text only",
    type: "other",
  });
});

test("keeps a tool result as a tool turn answering its call", () => {
  const { turns, warnings } = convertPrompt([
    {
      content: [
        {
          output: { type: "text", value: "sunny" },
          toolCallId: "call_1",
          toolName: "weather",
          type: "tool-result",
        },
        {
          output: { type: "json", value: { c: 31 } },
          toolCallId: "call_2",
          toolName: "weather",
          type: "tool-result",
        },
      ],
      role: "tool",
    },
  ]);
  expect(turns).toEqual([
    { callId: "call_1", content: "sunny", role: "tool" },
    { callId: "call_2", content: '{"c":31}', role: "tool" },
  ]);
  expect(warnings).toEqual([]);
});

test("keeps the calls an assistant turn made", () => {
  const { turns } = convertPrompt([
    {
      content: [
        { text: "Checking.", type: "text" },
        {
          input: { city: "Bangkok" },
          toolCallId: "call_1",
          toolName: "weather",
          type: "tool-call",
        },
      ],
      role: "assistant",
    },
  ]);
  expect(turns).toEqual([
    {
      calls: [{ id: "call_1", input: { city: "Bangkok" }, name: "weather" }],
      content: "Checking.",
      role: "assistant",
    },
  ]);
});

test("offers function tools and warns about provider-defined ones", () => {
  const { tools, warnings } = convertTools({
    prompt: [],
    tools: [
      {
        description: "Reads the weather.",
        inputSchema: { type: "object" },
        name: "weather",
        type: "function",
      },
      {
        args: {},
        id: "openai.web_search",
        name: "web",
        type: "provider-defined",
      },
    ],
  });
  expect(tools).toEqual([
    {
      description: "Reads the weather.",
      inputSchema: { type: "object" },
      name: "weather",
    },
  ]);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]?.type).toBe("unsupported-tool");
});

test("returns nothing for an empty prompt", () => {
  expect(convertPrompt([])).toEqual({ turns: [], warnings: [] });
});
