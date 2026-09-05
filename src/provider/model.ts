import { APICallError } from "@ai-sdk/provider";
import type {
  LanguageModelV2,
  LanguageModelV2File,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolCall,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
} from "@ai-sdk/provider";

import { fetchCatalog } from "../aipass/catalog";
import { deleteConversation, sendMessage } from "../aipass/client";
import type { SendOptions } from "../aipass/client";
import { fromDataUri } from "../aipass/inline";
import { inlineBase64, renderAsset, resolveAsset } from "../aipass/media";
import type { MediaAsset } from "../aipass/media";
import type { ChatModel } from "../aipass/models";
import { fetchCredits, settleCredits } from "../aipass/quotas";
import type { Credits, CreditUsage } from "../aipass/quotas";
import { EDGE_REFUSAL_HINT, isEdgeRefusal } from "../aipass/refusal";
import { clientIdFromCookie } from "../aipass/session";
import { parseAipassSSE } from "../aipass/stream";
import { resolveThinking, thinkingLevelSchema } from "../aipass/thinking";
import type { ThinkingLevel } from "../aipass/thinking";
import { config } from "../lib/config";
import { guardController } from "../lib/stream";
import { addText, charTokens, estimateTokens, newCharCount } from "../tokens";
import { renderCall, splitReply } from "../tools";
import type { ReplyPart, ToolCall, ToolDefinition } from "../tools";
import { filesOf, flattenPrompt, toAipassMessages } from "../translate";
import { convertPrompt, convertTools } from "./prompt";

const PROVIDER = "aipass";
const REASONING_ID = "reasoning";
const DETAIL_LIMIT = 300;

const estimatedUsage = (
  inputTokens: number,
  outputTokens: number
): LanguageModelV2Usage => ({
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
});

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

/**
 * AI Pass takes a reasoning level rather than a token budget, so the AI SDK's
 * own reasoning settings do not map onto it. A caller names one under this
 * provider's own options instead: `providerOptions.aipass.thinkingLevel`.
 */
const askedThinking = (
  options: LanguageModelV2CallOptions
): ThinkingLevel | undefined => {
  const asked = options.providerOptions?.aipass?.thinkingLevel;
  const parsed = thinkingLevelSchema.safeParse(asked);
  return parsed.success ? parsed.data : undefined;
};

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
  readonly signal: AbortSignal | undefined;
  readonly conversationId: string;
  readonly credits: Promise<Credits | null>;
  readonly inputTokens: number;
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
  const conversation = { tools, turns: prompt.turns };
  const attachments = filesOf(conversation).map((file, index) =>
    fromDataUri(file.uri, file.filename, index)
  );
  const text = flattenPrompt(conversation);
  const inputTokens = estimateTokens(text);
  const body = toAipassMessages(text, modelId);
  const credits = fetchCredits(cookie, options.abortSignal);
  const asked = askedThinking(options);
  const thinkingWarnings: LanguageModelV2CallWarning[] = [];
  let thinkingLevel: ThinkingLevel | null = null;
  if (asked !== undefined) {
    const catalog = await fetchCatalog(
      clientIdFromCookie(cookie),
      cookie,
      options.abortSignal
    );
    const resolved = resolveThinking(asked, catalog?.get(modelId));
    thinkingLevel = resolved.level;
    if (resolved.dropped) {
      thinkingWarnings.push({ message: resolved.dropped, type: "other" });
    }
  }
  const sendOptions: SendOptions = { attachments };
  if (thinkingLevel) {
    sendOptions.thinkingLevel = thinkingLevel;
  }
  const { conversationId, created, response } = await sendMessage(
    cookie,
    modelId,
    body,
    options.abortSignal,
    sendOptions
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && response.body && contentType.includes("event-stream")) {
    return {
      body: response.body,
      conversationId,
      credits,
      inputTokens,
      signal: options.abortSignal,
      tools,
      warnings: [
        ...prompt.warnings,
        ...offered.warnings,
        ...settingWarnings(options),
        ...thinkingWarnings,
      ],
    };
  }
  const detail = response.body ? await response.text().catch(() => "") : "";
  if (created) {
    await deleteConversation(cookie, conversationId);
  }
  const hint = isEdgeRefusal(response.status) ? EDGE_REFUSAL_HINT : "";
  throw new APICallError({
    message: `AI Pass answered ${response.status} (${contentType || "no content-type"})${hint}`,
    requestBodyValues: { messages: body, modelId },
    responseBody: detail.slice(0, DETAIL_LIMIT),
    statusCode: response.status,
    url: created
      ? `${config.origin}/actions/send-message/${conversationId}`
      : `${config.origin}/chat.data`,
  });
};

/**
 * The SDK carries a generated file natively, so an image comes back as an image
 * rather than as a link a caller has to notice and fetch. Only bytes fit that
 * shape: an asset too big to carry stays a link, as text, with the reason.
 */
const assetPart = (
  asset: MediaAsset
): LanguageModelV2File | { readonly text: string } => {
  if (!asset.inline) {
    return { text: `\n\n${renderAsset(asset)}\n\n` };
  }
  return {
    data: inlineBase64(asset),
    mediaType: asset.mediaType,
    type: "file",
  };
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
      const replyCount = newCharCount();
      const emit = (parts: readonly ReplyPart[]): void => {
        for (const part of parts) {
          if (part.type === "call") {
            closeText();
            calls += 1;
            addText(replyCount, renderCall(part.call));
            out.enqueue(toolCallPart(part.call));
            continue;
          }
          addText(replyCount, part.text);
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
          } else if (event.kind === "file") {
            const asset = await resolveAsset(cookie, event.file, turn.signal);
            if (asset) {
              const part = assetPart(asset);
              if ("type" in part) {
                closeText();
                out.enqueue(part);
              } else {
                emit(splitter.push(part.text));
              }
            }
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
          usage: estimatedUsage(turn.inputTokens, charTokens(replyCount)),
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
    const replyCount = newCharCount();
    const collect = (parts: readonly ReplyPart[]): void => {
      for (const part of parts) {
        if (part.type === "text") {
          text += part.text;
          addText(replyCount, part.text);
        } else {
          calls.push(part.call);
          addText(replyCount, renderCall(part.call));
        }
      }
    };
    const files: LanguageModelV2File[] = [];
    const splitter = splitReply(turn.tools);
    try {
      for await (const event of parseAipassSSE(turn.body)) {
        if (event.kind === "delta") {
          collect(splitter.push(event.text));
        } else if (event.kind === "reasoning") {
          reasoning += event.text;
        } else if (event.kind === "file") {
          const asset = await resolveAsset(cookie, event.file, turn.signal);
          if (asset) {
            const part = assetPart(asset);
            if ("type" in part) {
              files.push(part);
            } else {
              collect(splitter.push(part.text));
            }
          }
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
    content.push(...files, ...calls.map(toolCallPart));
    return {
      content,
      finishReason: settle(finishReason, calls.length),
      providerMetadata: creditMetadata(usage),
      usage: estimatedUsage(turn.inputTokens, charTokens(replyCount)),
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
