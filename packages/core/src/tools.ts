import { z } from "zod";

import { randomHex } from "./lib/id";

/**
 * AI Pass carries text only, so tools travel in the prompt: the model is told
 * which tools exist and asked to call one with a fenced `tool_call` block
 * holding one JSON object, and the reply is split back into text and calls.
 */

export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

export const toolInputSchema = z.record(z.string(), z.unknown());

export type ToolInput = z.infer<typeof toolInputSchema>;

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: ToolInput;
}

export type ReplyPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "call"; readonly call: ToolCall };

export interface ReplySplitter {
  readonly push: (text: string) => ReplyPart[];
  readonly flush: () => ReplyPart[];
}

export const FENCE_OPEN = "```tool_call\n";
export const FENCE_CLOSE = "\n```";

const CALL_ID_LENGTH = 24;

const callBodySchema = z.object({
  input: toolInputSchema.default({}),
  name: z.string().min(1),
});

const text = (value: string): ReplyPart[] =>
  value.length > 0 ? [{ text: value, type: "text" }] : [];

export const newCallId = (): string => randomHex(CALL_ID_LENGTH);

export const renderCall = (call: ToolCall): string =>
  `${FENCE_OPEN}${JSON.stringify({ input: call.input, name: call.name })}${FENCE_CLOSE}`;

const renderTool = (tool: ToolDefinition): string => {
  const summary =
    tool.description && tool.description.length > 0
      ? `- ${tool.name}: ${tool.description.trim()}`
      : `- ${tool.name}`;
  return tool.inputSchema === undefined
    ? summary
    : `${summary}\n  input schema: ${JSON.stringify(tool.inputSchema)}`;
};

export const renderToolGuide = (tools: readonly ToolDefinition[]): string =>
  [
    "You can call tools. To call one, write a block exactly like this, one block per call, then stop and wait for the result, which arrives in the next turn:",
    `${FENCE_OPEN}{"name": "<tool name>", "input": {<arguments matching the tool's input schema>}}${FENCE_CLOSE}`,
    `Tools:\n\n${tools.map(renderTool).join("\n")}`,
  ].join("\n\n");

const parseCall = (
  json: string,
  names: ReadonlySet<string>
): ToolCall | undefined => {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  const parsed = callBodySchema.safeParse(raw);
  if (!parsed.success || !names.has(parsed.data.name)) {
    return undefined;
  }
  return { id: newCallId(), input: parsed.data.input, name: parsed.data.name };
};

/** How many trailing characters could still turn out to open a fence. */
const heldLength = (tail: string): number => {
  const longest = Math.min(tail.length, FENCE_OPEN.length - 1);
  for (let length = longest; length > 0; length -= 1) {
    if (FENCE_OPEN.startsWith(tail.slice(-length))) {
      return length;
    }
  }
  return 0;
};

const UNFENCED_LIMIT = 4096;

const objectEnd = (value: string, from: number): number => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = from; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return -1;
};

/**
 * Text is released as soon as it can no longer open a fence. A fence that
 * never closes, or holds no call to an offered tool, is released as text.
 *
 * A reply that opens with the call object and no fence is read as a call
 * anyway. Some models write the body the guide asks for and drop the fence
 * around it, and the reply then arrives as prose with `stop`: observed as
 * `{"name":"load_skill","input":{…}}I can begin once the load_skill tool
 * result is available.` The caller sees a finished answer that narrates a
 * call nobody ran, which is worse than an error, and the retry in
 * `reply.ts` cannot see it either, since that waits for a `tool-calls`
 * finish reason. Recovering it here serves a streaming caller too, which
 * cannot be retried at all.
 *
 * The rule is deliberately the narrowest one that covers what was observed:
 * the object must be the first thing in the reply, it must parse, and it
 * must name a tool the caller offered — the same bar a fenced block passes.
 * Prose that quotes a call later on is left alone, which matters when the
 * caller is reviewing code and may quote one on purpose.
 */
export const splitReply = (tools: readonly ToolDefinition[]): ReplySplitter => {
  if (tools.length === 0) {
    return { flush: () => [], push: text };
  }
  const names = new Set(tools.map((tool) => tool.name));
  let buffer = "";
  let inBlock = false;
  let opening = true;

  /** Ends the open block; `fence` is what closed it, nothing when the reply ran out first. */
  const closeBlock = (json: string, fence: string): ReplyPart[] => {
    inBlock = false;
    const call = parseCall(json.trim(), names);
    return call
      ? [{ call, type: "call" }]
      : text(`${FENCE_OPEN}${json}${fence}`);
  };

  const openingCall = (final: boolean): ToolCall | "hold" | undefined => {
    const start = buffer.length - buffer.trimStart().length;
    if (buffer[start] !== "{") {
      // Leading whitespace alone decides nothing; anything else does.
      return buffer.trim().length === 0 && !final ? "hold" : undefined;
    }
    const end = objectEnd(buffer, start);
    if (end === -1) {
      return !final && buffer.length - start < UNFENCED_LIMIT
        ? "hold"
        : undefined;
    }
    const call = parseCall(buffer.slice(start, end), names);
    if (call === undefined) {
      return undefined;
    }
    buffer = buffer.slice(end);
    return call;
  };

  const drain = (final: boolean): ReplyPart[] => {
    const parts: ReplyPart[] = [];
    for (;;) {
      if (opening && !inBlock) {
        const found = openingCall(final);
        if (found === "hold") {
          return parts;
        }
        opening = false;
        if (found !== undefined) {
          parts.push({ call: found, type: "call" });
          continue;
        }
      }
      if (inBlock) {
        const end = buffer.indexOf(FENCE_CLOSE);
        if (end === -1) {
          if (!final) {
            return parts;
          }
          const json = buffer;
          buffer = "";
          parts.push(...closeBlock(json, ""));
          return parts;
        }
        const json = buffer.slice(0, end);
        buffer = buffer.slice(end + FENCE_CLOSE.length);
        if (buffer.startsWith("\n")) {
          buffer = buffer.slice(1);
        }
        parts.push(...closeBlock(json, FENCE_CLOSE));
        continue;
      }
      const start = buffer.indexOf(FENCE_OPEN);
      if (start === -1) {
        const hold = final ? 0 : heldLength(buffer);
        const released = buffer.slice(0, buffer.length - hold);
        buffer = buffer.slice(buffer.length - hold);
        parts.push(...text(released));
        return parts;
      }
      parts.push(...text(buffer.slice(0, start)));
      buffer = buffer.slice(start + FENCE_OPEN.length);
      inBlock = true;
    }
  };

  return {
    flush: () => drain(true),
    push: (chunk) => {
      buffer += chunk;
      return drain(false);
    },
  };
};
