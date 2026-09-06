import { deleteConversation, sendMessage } from "@thaipass/core/aipass/client";
import type { MediaAsset } from "@thaipass/core/aipass/media";
import { fetchCredits, settleCredits } from "@thaipass/core/aipass/quotas";
import type { CreditUsage } from "@thaipass/core/aipass/quotas";
import { readReply } from "@thaipass/core/reply";
import { toAipassMessages } from "@thaipass/core/translate";

/**
 * Image and music models answer on the same send-message stream as chat, with
 * `file` frames instead of text. Video is a polled job, served by video.ts.
 */

export interface MediaRequest {
  readonly cookie: string;
  readonly modelId: string;
  readonly prompt: string;
  readonly aspectRatio?: string;
  readonly signal: AbortSignal | undefined;
}

export interface MediaResult {
  readonly assets: readonly MediaAsset[];
  readonly text: string;
  readonly credits?: CreditUsage;
}

export class MediaError extends Error {
  override name = "MediaError";
  readonly status: number;
  readonly detail: string;

  constructor(message: string, status: number, detail = "") {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export const DETAIL_LIMIT = 300;

export const generateMedia = async (
  request: MediaRequest
): Promise<MediaResult> => {
  const { aspectRatio, cookie, modelId, prompt, signal } = request;
  const pending = fetchCredits(cookie, signal);
  const options = aspectRatio ? { imageAspectRatio: aspectRatio } : {};
  const { conversationId, created, response } = await sendMessage(
    cookie,
    modelId,
    toAipassMessages(prompt, modelId),
    signal,
    options
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !(response.ok && response.body) ||
    !contentType.includes("event-stream")
  ) {
    const detail = response.body ? await response.text().catch(() => "") : "";
    if (created) {
      await deleteConversation(cookie, conversationId);
    }
    throw new MediaError(
      `upstream ${response.status} (${contentType || "no content-type"})`,
      response.status,
      detail.slice(0, DETAIL_LIMIT)
    );
  }

  const assets: MediaAsset[] = [];
  let text = "";
  const reader = readReply({ body: response.body, cookie, signal, tools: [] });
  try {
    for await (const event of reader.events) {
      if (event.kind === "text") {
        text += event.text;
      } else if (event.kind === "file") {
        assets.push(event.asset);
      } else if (event.kind === "error") {
        throw new MediaError(event.message, 502);
      }
    }
  } finally {
    await deleteConversation(cookie, conversationId);
  }

  const { usage } = await settleCredits(cookie, pending);
  return { assets, credits: usage, text };
};

export const noAssetMessage = (result: MediaResult): string => {
  const said = result.text.trim();
  return said.length > 0
    ? `the model answered with text rather than a file: ${said.slice(0, DETAIL_LIMIT)}`
    : "the model produced no file and said nothing";
};
