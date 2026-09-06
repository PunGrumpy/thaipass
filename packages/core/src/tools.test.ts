import { expect, test } from "bun:test";

import { FENCE_CLOSE, FENCE_OPEN, renderToolGuide, splitReply } from "./tools";
import type { ReplyPart, ToolDefinition } from "./tools";

const WEATHER: ToolDefinition = {
  description: "Reads the weather.",
  name: "get_weather",
};

const block = (json: string): string => `${FENCE_OPEN}${json}${FENCE_CLOSE}`;

const textOf = (parts: readonly ReplyPart[]): string =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

const callsOf = (parts: readonly ReplyPart[]) =>
  parts
    .filter((part) => part.type === "call")
    .map((part) => ({ input: part.call.input, name: part.call.name }));

const splitAll = (chunks: readonly string[], tools = [WEATHER]) => {
  const splitter = splitReply(tools);
  const parts: ReplyPart[] = [];
  for (const chunk of chunks) {
    parts.push(...splitter.push(chunk));
  }
  parts.push(...splitter.flush());
  return parts;
};

test("passes plain text through untouched", () => {
  const parts = splitAll(["hello ", "world"]);
  expect(textOf(parts)).toBe("hello world");
  expect(callsOf(parts)).toEqual([]);
});

test("holds nothing back when no tools are offered", () => {
  const splitter = splitReply([]);
  expect(splitter.push("``")).toEqual([{ text: "``", type: "text" }]);
  expect(splitter.push(block('{"name":"get_weather"}'))).toHaveLength(1);
  expect(splitter.flush()).toEqual([]);
});

test("turns a whole block into a call", () => {
  const parts = splitAll([
    `Checking.\n\n${block('{"name":"get_weather","input":{"city":"Bangkok"}}')}`,
  ]);
  expect(textOf(parts)).toBe("Checking.\n\n");
  expect(callsOf(parts)).toEqual([
    { input: { city: "Bangkok" }, name: "get_weather" },
  ]);
});

test("reassembles a block split across deltas", () => {
  const whole = `Sure. ${block('{"name":"get_weather","input":{}}')} done`;
  const parts = splitAll([...whole].map((char) => char));
  expect(textOf(parts)).toBe("Sure.  done");
  expect(callsOf(parts)).toEqual([{ input: {}, name: "get_weather" }]);
});

test("releases text before a fence only once it cannot be a fence", () => {
  const splitter = splitReply([WEATHER]);
  expect(textOf(splitter.push("see ``"))).toBe("see ");
  expect(textOf(splitter.push("x"))).toBe("``x");
});

test("gives every call its own id", () => {
  const parts = splitAll([
    `${block('{"name":"get_weather"}')}\n${block('{"name":"get_weather"}')}`,
  ]);
  const ids = parts
    .filter((part) => part.type === "call")
    .map((part) => part.call.id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
});

test("keeps a block naming an unknown tool as text", () => {
  const json = '{"name":"launch","input":{}}';
  const parts = splitAll([block(json)]);
  expect(callsOf(parts)).toEqual([]);
  expect(textOf(parts)).toBe(block(json));
});

test("keeps a block that is not json as text", () => {
  const parts = splitAll([block("not json")]);
  expect(callsOf(parts)).toEqual([]);
  expect(textOf(parts)).toBe(block("not json"));
});

test("parses an unterminated block at the end of the reply", () => {
  const parts = splitAll([`${FENCE_OPEN}{"name":"get_weather","input":{}}`]);
  expect(callsOf(parts)).toEqual([{ input: {}, name: "get_weather" }]);
});

test("keeps an unterminated block that is not a call as text", () => {
  const parts = splitAll([`${FENCE_OPEN}still typing`]);
  expect(textOf(parts)).toBe(`${FENCE_OPEN}still typing`);
});

test("describes every tool and the fence in the guide", () => {
  const guide = renderToolGuide([
    WEATHER,
    { inputSchema: { type: "object" }, name: "get_time" },
  ]);
  expect(guide).toContain(FENCE_OPEN);
  expect(guide).toContain("- get_weather: Reads the weather.");
  expect(guide).toContain('- get_time\n  input schema: {"type":"object"}');
});
