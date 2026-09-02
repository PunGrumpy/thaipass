import { APICallError } from "@ai-sdk/provider";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

import { deleteConversation, sendMessage } from "../aipass/client";
import type { ChatModel } from "../aipass/models";
import { parseAipassSSE } from "../aipass/stream";
import { config } from "../lib/config";
import { guardController } from "../lib/stream";
import { toAipassMessages } from "../translate";
import { convertPrompt } from "./prompt";

const PROVIDER = "aipass";
const TEXT_ID = "text";
const REASONING_ID = "reasoning";
const DETAIL_LIMIT = 300;

const NO_USAGE: LanguageModelV2Usage = {
  inputTokens: undefined,
  outputTokens: undefined,
  totalTokens: undefined,
};

const FINISH_REASONS = new Map<string, LanguageModelV2FinishReason>([
  ["content-filter", "content-filter"],
  ["error", "error"],
  ["length", "length"],
  ["other", "other"],
  ["stop", "stop"],
  ["tool-calls", "tool-calls"],
  ["unknown", "unknown"],
]);

const UNSUPPORTED_SETTINGS = [
  "frequencyPenalty",
  "maxOutputTokens",
  "presencePenalty",
  "responseFormat",
  "seed",
  "stopSequences",
  "temperature",
  "toolChoice",
  "topK",
  "topP",
] as const;

const toFinishReason = (reason: string): LanguageModelV2FinishReason =>
  FINISH_REASONS.get(reason) ?? "unknown";

const callWarnings = (
  options: LanguageModelV2CallOptions
): LanguageModelV2CallWarning[] => {
  const warnings: LanguageModelV2CallWarning[] = [];
  for (const setting of UNSUPPORTED_SETTINGS) {
    if (options[setting] !== undefined) {
      warnings.push({ setting, type: "unsupported-setting" });
    }
  }
  for (const tool of options.tools ?? []) {
    warnings.push({ tool, type: "unsupported-tool" });
  }
  return warnings;
};

interface Turn {
  readonly body: ReadableStream<Uint8Array>;
  readonly conversationId: string;
  readonly warnings: LanguageModelV2CallWarning[];
}

const startTurn = async (
  cookie: string,
  modelId: ChatModel,
  options: LanguageModelV2CallOptions
): Promise<Turn> => {
  const { messages, warnings } = convertPrompt(options.prompt);
  const body = toAipassMessages(messages, modelId);
  const { conversationId, response } = await sendMessage(
    cookie,
    modelId,
    body,
    options.abortSignal
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && response.body && contentType.includes("event-stream")) {
    return {
      body: response.body,
      conversationId,
      warnings: [...warnings, ...callWarnings(options)],
    };
  }
  const detail = response.body ? await response.text().catch(() => "") : "";
  await deleteConversation(cookie, conversationId);
  throw new APICallError({
    message: `AI Pass answered ${response.status} (${contentType || "no content-type"})`,
    requestBodyValues: { messages: body, modelId },
    responseBody: detail.slice(0, DETAIL_LIMIT),
    statusCode: response.status,
    url: `${config.origin}/actions/send-message/${conversationId}`,
  });
};

const streamTurn = (
  cookie: string,
  turn: Turn
): ReadableStream<LanguageModelV2StreamPart> =>
  new ReadableStream<LanguageModelV2StreamPart>({
    async start(raw) {
      const out = guardController(raw);
      out.enqueue({ type: "stream-start", warnings: turn.warnings });
      let finishReason: LanguageModelV2FinishReason = "stop";
      let textOpen = false;
      let reasoningOpen = false;
      try {
        for await (const event of parseAipassSSE(turn.body)) {
          if (event.kind === "delta") {
            if (!textOpen) {
              out.enqueue({ id: TEXT_ID, type: "text-start" });
              textOpen = true;
            }
            out.enqueue({ delta: event.text, id: TEXT_ID, type: "text-delta" });
          } else if (event.kind === "reasoning") {
            if (!reasoningOpen) {
              out.enqueue({ id: REASONING_ID, type: "reasoning-start" });
              reasoningOpen = true;
            }
            out.enqueue({
              delta: event.text,
              id: REASONING_ID,
              type: "reasoning-delta",
            });
          } else if (event.kind === "finish") {
            finishReason = toFinishReason(event.reason);
          } else {
            finishReason = "error";
            out.enqueue({ error: new Error(event.message), type: "error" });
          }
        }
      } catch (error) {
        finishReason = "error";
        out.enqueue({ error, type: "error" });
      } finally {
        if (reasoningOpen) {
          out.enqueue({ id: REASONING_ID, type: "reasoning-end" });
        }
        if (textOpen) {
          out.enqueue({ id: TEXT_ID, type: "text-end" });
        }
        out.enqueue({ finishReason, type: "finish", usage: NO_USAGE });
        await deleteConversation(cookie, turn.conversationId);
        out.close();
      }
    },
  });

export const aipassModel = (
  cookie: string,
  modelId: ChatModel
): LanguageModelV2 => ({
  doGenerate: async (options) => {
    const turn = await startTurn(cookie, modelId, options);
    let text = "";
    let reasoning = "";
    let finishReason: LanguageModelV2FinishReason = "stop";
    try {
      for await (const event of parseAipassSSE(turn.body)) {
        if (event.kind === "delta") {
          text += event.text;
        } else if (event.kind === "reasoning") {
          reasoning += event.text;
        } else if (event.kind === "finish") {
          finishReason = toFinishReason(event.reason);
        } else {
          finishReason = "error";
        }
      }
    } finally {
      await deleteConversation(cookie, turn.conversationId);
    }
    const content: LanguageModelV2Content[] = [];
    if (reasoning.length > 0) {
      content.push({ text: reasoning, type: "reasoning" });
    }
    if (text.length > 0) {
      content.push({ text, type: "text" });
    }
    return {
      content,
      finishReason,
      usage: NO_USAGE,
      warnings: turn.warnings,
    };
  },
  doStream: async (options) => {
    const turn = await startTurn(cookie, modelId, options);
    return { stream: streamTurn(cookie, turn) };
  },
  modelId,
  provider: PROVIDER,
  specificationVersion: "v2",
  supportedUrls: {},
});
