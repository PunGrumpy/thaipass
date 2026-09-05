import type {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2FilePart,
  LanguageModelV2Prompt,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultOutput,
} from "@ai-sdk/provider";

import { nameFor } from "../aipass/inline";
import { toolInputSchema } from "../tools";
import type { ToolCall, ToolDefinition, ToolInput } from "../tools";
import type { ChatTurn, TurnFile } from "../translate";

export interface ConvertedPrompt {
  readonly turns: ChatTurn[];
  readonly warnings: LanguageModelV2CallWarning[];
}

export interface ConvertedTools {
  readonly tools: ToolDefinition[];
  readonly warnings: LanguageModelV2CallWarning[];
}

const resultText = (output: LanguageModelV2ToolResultOutput): string => {
  switch (output.type) {
    case "text":
    case "error-text": {
      return output.value;
    }
    case "json":
    case "error-json": {
      return JSON.stringify(output.value);
    }
    default: {
      return output.value
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
    }
  }
};

/** The SDK types a call's input as unknown; a call whose input is not an object carries none. */
const inputOf = (part: LanguageModelV2ToolCallPart): ToolInput => {
  const parsed = toolInputSchema.safeParse(part.input);
  return parsed.success ? parsed.data : {};
};

const droppedWarning = (
  dropped: ReadonlySet<string>
): LanguageModelV2CallWarning[] =>
  dropped.size > 0
    ? [
        {
          message: `the provider dropped ${[...dropped].toSorted().join(", ")} parts because AI Pass reads text only`,
          type: "other",
        },
      ]
    : [];

/**
 * The SDK hands a file's bytes three ways. Two are inline and become a data
 * URI; a URL is passed through as it stands so the one place that decodes
 * files can refuse it with the same reason every protocol gets.
 */
const fileUri = (part: LanguageModelV2FilePart): string => {
  const { data, mediaType } = part;
  if (data instanceof URL) {
    return data.href;
  }
  if (data instanceof Uint8Array) {
    return `data:${mediaType};base64,${Buffer.from(data).toString("base64")}`;
  }
  return data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
};

const toTurnFile = (
  part: LanguageModelV2FilePart,
  index: number
): TurnFile => ({
  filename: part.filename ?? nameFor(part.mediaType, index),
  uri: fileUri(part),
});

/** Text stays text, files and tool calls keep their own shape, the rest is dropped and named. */
export const convertPrompt = (
  prompt: LanguageModelV2Prompt
): ConvertedPrompt => {
  const turns: ChatTurn[] = [];
  const dropped = new Set<string>();
  for (const message of prompt) {
    if (message.role === "system") {
      turns.push({ content: message.content, role: "system" });
      continue;
    }
    if (message.role === "tool") {
      for (const part of message.content) {
        turns.push({
          callId: part.toolCallId,
          content: resultText(part.output),
          role: "tool",
        });
      }
      continue;
    }
    const text: string[] = [];
    const calls: ToolCall[] = [];
    const files: TurnFile[] = [];
    for (const part of message.content) {
      if (part.type === "text" || part.type === "reasoning") {
        text.push(part.text);
      } else if (part.type === "file") {
        files.push(toTurnFile(part, files.length));
      } else if (part.type === "tool-call") {
        calls.push({
          id: part.toolCallId,
          input: inputOf(part),
          name: part.toolName,
        });
      } else {
        dropped.add(part.type);
      }
    }
    const turn: ChatTurn = { content: text.join(""), role: message.role };
    const withFiles = files.length > 0 ? { ...turn, files } : turn;
    turns.push(calls.length > 0 ? { ...withFiles, calls } : withFiles);
  }
  return { turns, warnings: droppedWarning(dropped) };
};

/** Function tools are offered through the text protocol; provider-defined ones have no upstream to run on. */
export const convertTools = (
  options: LanguageModelV2CallOptions
): ConvertedTools => {
  const tools: ToolDefinition[] = [];
  const warnings: LanguageModelV2CallWarning[] = [];
  for (const tool of options.tools ?? []) {
    if (tool.type === "function") {
      tools.push({
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name,
      });
    } else {
      warnings.push({ tool, type: "unsupported-tool" });
    }
  }
  return { tools, warnings };
};
