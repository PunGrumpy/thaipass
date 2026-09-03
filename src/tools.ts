import { z } from "zod";

/**
 * The text protocol tool calls travel in.
 *
 * AI Pass reads a model id and one message and answers with text, so a tool
 * call cannot cross the wire as a structured field. Instead the proxy tells the
 * model which tools exist and how to ask for one (a fenced `tool_call` block
 * holding one JSON object), renders past calls and results in the same shape,
 * and splits the reply back into text and calls. Both HTTP surfaces and the
 * AI SDK provider share this one protocol.
 */

export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

/** A call's arguments: whatever JSON object the model wrote, shaped by the tool's own schema. */
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

export const newCallId = (): string =>
  crypto.randomUUID().replaceAll("-", "").slice(0, CALL_ID_LENGTH);

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

const passthrough = (): ReplySplitter => ({
  flush: () => [],
  push: text,
});

/**
 * Splits a reply into text and tool calls as it streams.
 *
 * Text is released as soon as it can no longer be the start of a fence; a
 * fence that never closes, or holds something other than a call to an offered
 * tool, is released as the text it was. Without tools nothing is held back.
 */
export const splitReply = (tools: readonly ToolDefinition[]): ReplySplitter => {
  if (tools.length === 0) {
    return passthrough();
  }
  const names = new Set(tools.map((tool) => tool.name));
  let buffer = "";
  let inBlock = false;

  const closeBlock = (json: string): ReplyPart[] => {
    inBlock = false;
    const call = parseCall(json.trim(), names);
    return call
      ? [{ call, type: "call" }]
      : text(`${FENCE_OPEN}${json}${FENCE_CLOSE}`);
  };

  const drain = (final: boolean): ReplyPart[] => {
    const parts: ReplyPart[] = [];
    for (;;) {
      if (inBlock) {
        const end = buffer.indexOf(FENCE_CLOSE);
        if (end === -1) {
          if (!final) {
            return parts;
          }
          const json = buffer;
          buffer = "";
          inBlock = false;
          const call = parseCall(json.trim(), names);
          parts.push(
            ...(call
              ? [{ call, type: "call" } as const]
              : text(`${FENCE_OPEN}${json}`))
          );
          return parts;
        }
        const json = buffer.slice(0, end);
        buffer = buffer.slice(end + FENCE_CLOSE.length);
        if (buffer.startsWith("\n")) {
          buffer = buffer.slice(1);
        }
        parts.push(...closeBlock(json));
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
