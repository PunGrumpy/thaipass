import { deleteConversation, sendMessage } from "../aipass/client";
import type { MediaAsset } from "../aipass/media";
import { fetchCredits, settleCredits } from "../aipass/quotas";
import type { CreditUsage } from "../aipass/quotas";
import { readReply } from "../reply";
import { toAipassMessages } from "../translate";

/**
 * One turn whose answer is a file rather than a sentence.
 *
 * Image and music models take the same send-message path the chat models take
 * and answer on the same stream; what differs is that the interesting frames
 * are `file` rather than `text-delta`. This runs that turn to the end, reads
 * every asset it produced, and leaves no conversation behind.
 *
 * Video does not come this way — it is a job that is submitted and polled — so
 * it is not served from here.
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
  /** Anything the model said alongside the file, which is usually nothing. */
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

/** What to say when a model answered with words where a file was asked for. */
export const noAssetMessage = (result: MediaResult): string => {
  const said = result.text.trim();
  return said.length > 0
    ? `the model answered with text rather than a file: ${said.slice(0, DETAIL_LIMIT)}`
    : "the model produced no file and said nothing";
};
