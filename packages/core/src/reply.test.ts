import { expect, test } from "bun:test";

import {
  finishReasonOf,
  isAbandonedToolCall,
  readReply,
  replyTokens,
} from "./reply";
import type { ReplyEvent } from "./reply";
import { sseStream } from "./testing/sse";
import { FENCE_CLOSE, FENCE_OPEN } from "./tools";
import type { ToolDefinition } from "./tools";

const WEATHER: ToolDefinition = {
  description: "Reads the weather.",
  name: "get_weather",
};

const delta = (text: string): string =>
  JSON.stringify({ delta: text, type: "text-delta" });

const readAll = async (
  frames: readonly string[],
  tools: readonly ToolDefinition[] = []
) => {
  const reader = readReply({
    body: sseStream(frames),
    cookie: "session=abc",
    signal: undefined,
    tools,
  });
  const events: ReplyEvent[] = [];
  for await (const event of reader.events) {
    events.push(event);
  }
  return { events, tally: reader.tally };
};

test("splits a fenced call out of the text and counts both", async () => {
  const block = `${FENCE_OPEN}{"name":"get_weather","input":{"city":"Bangkok"}}${FENCE_CLOSE}`;
  const { events, tally } = await readAll(
    [delta("Checking.\n\n"), delta(block), delta(" done")],
    [WEATHER]
  );
  expect(events.map((event) => event.kind)).toEqual(["text", "call", "text"]);
  expect(tally.calls).toBe(1);
  expect(tally.deltas).toBe(3);
  expect(tally.chars).toBe("Checking.\n\n done".length);
  expect(replyTokens(tally)).toBeGreaterThan(0);
  expect(finishReasonOf(tally)).toBe("tool-calls");
});

test("keeps the finish reason upstream gave, and hands an error over", async () => {
  const { events, tally } = await readAll([
    JSON.stringify({ delta: "hmm", type: "reasoning-delta" }),
    delta("hi"),
    JSON.stringify({ error: "boom", type: "error" }),
    JSON.stringify({ finishReason: "length", type: "finish" }),
  ]);
  expect(events).toEqual([
    { kind: "reasoning", text: "hmm" },
    { kind: "text", text: "hi" },
    { kind: "error", message: "boom" },
  ]);
  expect(tally.reasoningChars).toBe(3);
  expect(finishReasonOf(tally)).toBe("length");
});

test("calls a turn that finished on tool-calls with no call an error", async () => {
  const { tally } = await readAll([
    delta("Sorry, I could not respond to this request."),
    JSON.stringify({ finishReason: "tool-calls", type: "finish" }),
  ]);
  expect(isAbandonedToolCall(tally)).toBe(true);
  expect(finishReasonOf(tally)).toBe("error");
});

test("leaves a tool call upstream reported and the splitter found alone", async () => {
  const block = `${FENCE_OPEN}{"name":"get_weather","input":{"city":"Bangkok"}}${FENCE_CLOSE}`;
  const { tally } = await readAll(
    [
      delta(block),
      JSON.stringify({ finishReason: "tool-calls", type: "finish" }),
    ],
    [WEATHER]
  );
  expect(isAbandonedToolCall(tally)).toBe(false);
  expect(finishReasonOf(tally)).toBe("tool-calls");
});

test("resolves a generated file into an asset without counting it as text", async () => {
  const { events, tally } = await readAll([
    JSON.stringify({
      mediaType: "image/png",
      type: "file",
      url: "data:image/png;base64,AA==",
    }),
  ]);
  expect(events).toHaveLength(1);
  const [event] = events;
  expect(event?.kind).toBe("file");
  if (event?.kind === "file") {
    expect(event.asset.inline).toBe(true);
    expect(event.asset.kind).toBe("image");
  }
  expect(tally.files).toBe(1);
  expect(tally.chars).toBe(0);
});
