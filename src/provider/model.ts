import { APICallError } from "@ai-sdk/provider";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolCall,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
} from "@ai-sdk/provider";

import { deleteConversation, sendMessage } from "../aipass/client";
import type { ChatModel } from "../aipass/models";
import { fetchCredits, settleCredits } from "../aipass/quotas";
import type { Credits, CreditUsage } from "../aipass/quotas";
import { parseAipassSSE } from "../aipass/stream";
import { config } from "../lib/config";
import { guardController } from "../lib/stream";
import { splitReply } from "../tools";
import type { ReplyPart, ToolCall, ToolDefinition } from "../tools";
import { toAipassMessages } from "../translate";
import { convertPrompt, convertTools } from "./prompt";

const PROVIDER = "aipass";
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

const settingWarnings = (
  options: LanguageModelV2CallOptions
): LanguageModelV2CallWarning[] => {
  const warnings: LanguageModelV2CallWarning[] = [];
  for (const setting of UNSUPPORTED_SETTINGS) {
    if (options[setting] !== undefined) {
      warnings.push({ setting, type: "unsupported-setting" });
    }
  }
  return warnings;
};

/** Provider metadata allows no undefined, so `spent` is left out when unknown. */
const creditMetadata = (
  usage: CreditUsage | undefined
): SharedV2ProviderMetadata | undefined => {
  if (!usage) {
    return undefined;
  }
  const { spent, ...balance } = usage;
  return {
    aipass: { credits: spent === undefined ? balance : { ...balance, spent } },
  };
};

const toolCallPart = (call: ToolCall): LanguageModelV2ToolCall => ({
  input: JSON.stringify(call.input),
  toolCallId: call.id,
  toolName: call.name,
  type: "tool-call",
});

interface Turn {
  readonly body: ReadableStream<Uint8Array>;
  readonly conversationId: string;
  readonly credits: Promise<Credits | null>;
  readonly tools: readonly ToolDefinition[];
  readonly warnings: LanguageModelV2CallWarning[];
}

const startTurn = async (
  cookie: string,
  modelId: ChatModel,
  options: LanguageModelV2CallOptions
): Promise<Turn> => {
  const prompt = convertPrompt(options.prompt);
  const offered = convertTools(options);
  const { tools } = offered;
  const body = toAipassMessages({ tools, turns: prompt.turns }, modelId);
  const credits = fetchCredits(cookie, options.abortSignal);
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
      credits,
      tools,
      warnings: [
        ...prompt.warnings,
        ...offered.warnings,
        ...settingWarnings(options),
      ],
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

/** A reply with calls finishes as tool-calls unless upstream said otherwise. */
const settle = (
  finishReason: LanguageModelV2FinishReason,
  calls: number
): LanguageModelV2FinishReason =>
  calls > 0 && finishReason === "stop" ? "tool-calls" : finishReason;

const streamTurn = (
  cookie: string,
  turn: Turn
): ReadableStream<LanguageModelV2StreamPart> =>
  new ReadableStream<LanguageModelV2StreamPart>({
    async start(raw) {
      const out = guardController(raw);
      out.enqueue({ type: "stream-start", warnings: turn.warnings });
      let finishReason: LanguageModelV2FinishReason = "stop";
      let textId: string | undefined;
      let textBlocks = 0;
      let calls = 0;
      let reasoningOpen = false;
      const closeText = (): void => {
        if (textId !== undefined) {
          out.enqueue({ id: textId, type: "text-end" });
          textId = undefined;
        }
      };
      const emit = (parts: readonly ReplyPart[]): void => {
        for (const part of parts) {
          if (part.type === "call") {
            closeText();
            calls += 1;
            out.enqueue(toolCallPart(part.call));
            continue;
          }
          if (textId === undefined) {
            textId = `text-${textBlocks}`;
            textBlocks += 1;
            out.enqueue({ id: textId, type: "text-start" });
          }
          out.enqueue({ delta: part.text, id: textId, type: "text-delta" });
        }
      };
      const splitter = splitReply(turn.tools);
      try {
        for await (const event of parseAipassSSE(turn.body)) {
          if (event.kind === "delta") {
            emit(splitter.push(event.text));
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
        emit(splitter.flush());
      } catch (error) {
        finishReason = "error";
        out.enqueue({ error, type: "error" });
      } finally {
        if (reasoningOpen) {
          out.enqueue({ id: REASONING_ID, type: "reasoning-end" });
        }
        closeText();
        const [{ usage }] = await Promise.all([
          settleCredits(cookie, turn.credits),
          deleteConversation(cookie, turn.conversationId),
        ]);
        out.enqueue({
          finishReason: settle(finishReason, calls),
          providerMetadata: creditMetadata(usage),
          type: "finish",
          usage: NO_USAGE,
        });
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
    const calls: ToolCall[] = [];
    let text = "";
    let reasoning = "";
    let finishReason: LanguageModelV2FinishReason = "stop";
    const collect = (parts: readonly ReplyPart[]): void => {
      for (const part of parts) {
        if (part.type === "text") {
          text += part.text;
        } else {
          calls.push(part.call);
        }
      }
    };
    const splitter = splitReply(turn.tools);
    try {
      for await (const event of parseAipassSSE(turn.body)) {
        if (event.kind === "delta") {
          collect(splitter.push(event.text));
        } else if (event.kind === "reasoning") {
          reasoning += event.text;
        } else if (event.kind === "finish") {
          finishReason = toFinishReason(event.reason);
        } else {
          finishReason = "error";
        }
      }
      collect(splitter.flush());
    } finally {
      await deleteConversation(cookie, turn.conversationId);
    }
    const { usage } = await settleCredits(cookie, turn.credits);
    const content: LanguageModelV2Content[] = [];
    if (reasoning.length > 0) {
      content.push({ text: reasoning, type: "reasoning" });
    }
    if (text.length > 0) {
      content.push({ text, type: "text" });
    }
    content.push(...calls.map(toolCallPart));
    return {
      content,
      finishReason: settle(finishReason, calls.length),
      providerMetadata: creditMetadata(usage),
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
