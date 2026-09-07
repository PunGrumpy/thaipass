import { expect, test } from "bun:test";

import { sseStream } from "../testing/sse";
import { parseAipassSSE } from "./stream";
import type { SSESkips, StreamEvent } from "./stream";

const collect = async (
  frames: string[],
  skips?: SSESkips
): Promise<StreamEvent[]> => {
  const events: StreamEvent[] = [];
  for await (const event of parseAipassSSE(sseStream(frames), skips)) {
    events.push(event);
  }
  return events;
};

const newSkips = (): SSESkips => ({ count: 0, types: new Set() });

test("yields text deltas in order", async () => {
  const events = await collect([
    '{"type":"text-delta","delta":"he"}',
    '{"type":"text-delta","delta":"llo"}',
  ]);
  expect(events).toEqual([
    { kind: "delta", text: "he" },
    { kind: "delta", text: "llo" },
  ]);
});

test("separates reasoning deltas from text deltas", async () => {
  const events = await collect([
    '{"type":"reasoning-delta","delta":"think"}',
    '{"type":"text-delta","delta":"say"}',
  ]);
  expect(events).toEqual([
    { kind: "reasoning", text: "think" },
    { kind: "delta", text: "say" },
  ]);
});

test("passes the upstream finish reason through", async () => {
  const events = await collect(['{"type":"finish","finishReason":"length"}']);
  expect(events).toEqual([{ kind: "finish", reason: "length" }]);
});

test("defaults a missing finish reason to stop", async () => {
  const events = await collect(['{"type":"finish"}']);
  expect(events).toEqual([{ kind: "finish", reason: "stop" }]);
});

test("defaults a non-string finish reason to stop", async () => {
  const events = await collect(['{"type":"finish","finishReason":{"code":7}}']);
  expect(events).toEqual([{ kind: "finish", reason: "stop" }]);
});

test("prefers errorText over error on error events", async () => {
  const events = await collect([
    '{"type":"error","error":"raw","errorText":"quota exceeded"}',
  ]);
  expect(events).toEqual([{ kind: "error", message: "quota exceeded" }]);
});

test("falls back to a generic message when an error carries no text", async () => {
  const events = await collect(['{"type":"error"}']);
  expect(events).toEqual([{ kind: "error", message: "upstream error" }]);
});

test("turns a failed upstream tool into an error, naming the tool", async () => {
  const events = await collect([
    '{"type":"tool-input-error","toolName":"search","errorText":"boom"}',
  ]);
  expect(events).toEqual([
    { kind: "error", message: "AI Pass search failed: boom" },
  ]);
});

test("turns a failed tool output into an error too", async () => {
  const events = await collect([
    '{"type":"tool-output-error","toolName":"search","errorText":"boom"}',
  ]);
  expect(events).toEqual([
    { kind: "error", message: "AI Pass search failed: boom" },
  ]);
});

test("reports a failed tool that carries neither a name nor a reason", async () => {
  const events = await collect(['{"type":"tool-output-error"}']);
  expect(events).toEqual([
    { kind: "error", message: "AI Pass tool failed: no detail" },
  ]);
});

test("stops counting failed tools as undecoded events", async () => {
  const skips = newSkips();
  const events = await collect(
    [
      '{"type":"tool-input-error","errorText":"boom"}',
      '{"type":"text-delta","delta":"sorry"}',
    ],
    skips
  );
  expect(events).toEqual([
    { kind: "error", message: "AI Pass tool failed: boom" },
    { kind: "delta", text: "sorry" },
  ]);
  expect(skips.count).toBe(0);
});

test("skips unknown event types and records their names", async () => {
  const skips = newSkips();
  const events = await collect(
    [
      '{"type":"start-step"}',
      '{"type":"tool-call","toolName":"search"}',
      '{"type":"text-delta","delta":"hi"}',
    ],
    skips
  );
  expect(events).toEqual([{ kind: "delta", text: "hi" }]);
  expect(skips.count).toBe(2);
  expect([...skips.types].toSorted()).toEqual(["start-step", "tool-call"]);
});

test("counts malformed frames without naming a type", async () => {
  const skips = newSkips();
  const events = await collect(["{not json"], skips);
  expect(events).toEqual([]);
  expect(skips.count).toBe(1);
  expect([...skips.types]).toEqual([]);
});

test("parses without a skip collector", async () => {
  const events = await collect([
    '{"type":"start-step"}',
    '{"type":"text-delta","delta":"hi"}',
  ]);
  expect(events).toEqual([{ kind: "delta", text: "hi" }]);
});
