import { APICallError, NoSuchModelError } from "@ai-sdk/provider";
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
import { chatModelProblem, fetchCatalog } from "@thaipass/core/aipass/catalog";
import { deleteConversation, sendMessage } from "@thaipass/core/aipass/client";
import { inlineBase64, renderAsset } from "@thaipass/core/aipass/media";
import type { MediaAsset } from "@thaipass/core/aipass/media";
import { fetchCredits, settleCredits } from "@thaipass/core/aipass/quotas";
import type { Credits, CreditUsage } from "@thaipass/core/aipass/quotas";
import {
  EDGE_REFUSAL_HINT,
  isEdgeRefusal,
} from "@thaipass/core/aipass/refusal";
import { clientIdFromCookie } from "@thaipass/core/aipass/session";
import { thinkingLevelSchema } from "@thaipass/core/aipass/thinking";
import type { ThinkingLevel } from "@thaipass/core/aipass/thinking";
import { config } from "@thaipass/core/lib/config";
import { guardController } from "@thaipass/core/lib/stream";
import {
  finishReasonOf,
  prepareTurn,
  readReply,
  replyTokens,
} from "@thaipass/core/reply";
import type { ReplyReader } from "@thaipass/core/reply";
import type { ToolCall } from "@thaipass/core/tools";
import { toAipassMessages } from "@thaipass/core/translate";

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

/** AI Pass takes a level, not a token budget, so the SDK's own reasoning settings do not map. */
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
  readonly reader: ReplyReader;
  readonly conversationId: string;
  readonly credits: Promise<Credits | null>;
  readonly inputTokens: number;
  readonly warnings: LanguageModelV2CallWarning[];
}

const startTurn = async (
  cookie: string,
  modelId: string,
  options: LanguageModelV2CallOptions
): Promise<Turn> => {
  const prompt = convertPrompt(options.prompt);
  const offered = convertTools(options);
  const { tools } = offered;
  const catalog = fetchCatalog(
    clientIdFromCookie(cookie),
    cookie,
    options.abortSignal
  );
  const problem = chatModelProblem(modelId, await catalog);
  if (problem) {
    throw new NoSuchModelError({
      message: problem,
      modelId,
      modelType: "languageModel",
    });
  }
  const credits = fetchCredits(cookie, options.abortSignal);
  const prepared = await prepareTurn(
    { tools, turns: prompt.turns },
    modelId,
    askedThinking(options),
    () => catalog
  );
  const body = toAipassMessages(prepared.prompt, modelId);
  const { conversationId, created, response } = await sendMessage(
    cookie,
    modelId,
    body,
    options.abortSignal,
    prepared.sendOptions
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && response.body && contentType.includes("event-stream")) {
    const warnings = [
      ...prompt.warnings,
      ...offered.warnings,
      ...settingWarnings(options),
    ];
    if (prepared.thinkingDropped) {
      warnings.push({ message: prepared.thinkingDropped, type: "other" });
    }
    return {
      conversationId,
      credits,
      inputTokens: prepared.inputTokens,
      reader: readReply({
        body: response.body,
        cookie,
        signal: options.abortSignal,
        tools,
      }),
      warnings,
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

/** An inline asset becomes the SDK's file part; a link is rendered as text with the reason. */
const assetPart = (
  asset: MediaAsset
): LanguageModelV2File | { readonly text: string } => {
  if (!asset.inline) {
    return { text: renderAsset(asset) };
  }
  return {
    data: inlineBase64(asset),
    mediaType: asset.mediaType,
    type: "file",
  };
};

const streamTurn = (
  cookie: string,
  turn: Turn
): ReadableStream<LanguageModelV2StreamPart> =>
  new ReadableStream<LanguageModelV2StreamPart>({
    async start(raw) {
      const out = guardController(raw);
      const { reader } = turn;
      const { tally } = reader;
      out.enqueue({ type: "stream-start", warnings: turn.warnings });
      let textId: string | undefined;
      let textBlocks = 0;
      let reasoningOpen = false;
      const closeText = (): void => {
        if (textId !== undefined) {
          out.enqueue({ id: textId, type: "text-end" });
          textId = undefined;
        }
      };
      const text = (delta: string): void => {
        if (textId === undefined) {
          textId = `text-${textBlocks}`;
          textBlocks += 1;
          out.enqueue({ id: textId, type: "text-start" });
        }
        out.enqueue({ delta, id: textId, type: "text-delta" });
      };
      try {
        for await (const event of reader.events) {
          if (event.kind === "text") {
            text(event.text);
          } else if (event.kind === "call") {
            closeText();
            out.enqueue(toolCallPart(event.call));
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
            const part = assetPart(event.asset);
            if ("type" in part) {
              closeText();
              out.enqueue(part);
            } else {
              text(part.text);
            }
          } else {
            tally.finishReason = "error";
            out.enqueue({ error: new Error(event.message), type: "error" });
          }
        }
      } catch (error) {
        tally.finishReason = "error";
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
          finishReason: toFinishReason(finishReasonOf(tally)),
          providerMetadata: creditMetadata(usage),
          type: "finish",
          usage: estimatedUsage(turn.inputTokens, replyTokens(tally)),
        });
        out.close();
      }
    },
  });

export const aipassModel = (
  cookie: string,
  modelId: string
): LanguageModelV2 => ({
  doGenerate: async (options) => {
    const turn = await startTurn(cookie, modelId, options);
    const { reader } = turn;
    const { tally } = reader;
    const calls: ToolCall[] = [];
    const files: LanguageModelV2File[] = [];
    let text = "";
    let reasoning = "";
    try {
      for await (const event of reader.events) {
        if (event.kind === "text") {
          text += event.text;
        } else if (event.kind === "call") {
          calls.push(event.call);
        } else if (event.kind === "reasoning") {
          reasoning += event.text;
        } else if (event.kind === "file") {
          const part = assetPart(event.asset);
          if ("type" in part) {
            files.push(part);
          } else {
            text += part.text;
          }
        } else {
          tally.finishReason = "error";
        }
      }
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
      finishReason: toFinishReason(finishReasonOf(tally)),
      providerMetadata: creditMetadata(usage),
      usage: estimatedUsage(turn.inputTokens, replyTokens(tally)),
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
