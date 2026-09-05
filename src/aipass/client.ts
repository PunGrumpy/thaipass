import { log } from "evlog";

import { config } from "../lib/config";
import { isEdgeRefusal } from "./refusal";
import { browserPostHeaders, conversationJsonHeaders } from "./request";
import type { AipassMessage, AipassPart } from "./stream";
import type { ThinkingLevel } from "./thinking";
import { uploadAttachment } from "./upload";
import type { Attachment } from "./upload";

const CONVERSATION_ID_LENGTH = 16;
const TITLE_PREVIEW_LENGTH = 400;

const postAction = (
  cookie: string,
  path: string,
  referer: string,
  fields: Record<string, string>,
  signal?: AbortSignal
): Promise<Response> =>
  fetch(`${config.origin}${path}`, {
    body: new URLSearchParams(fields).toString(),
    headers: browserPostHeaders(
      cookie,
      referer,
      "application/x-www-form-urlencoded;charset=UTF-8"
    ),
    method: "POST",
    redirect: "manual",
    signal,
  });

/** Frees the socket for a response nobody is going to read. */
const drain = async (response: Response): Promise<number> => {
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  return response.status;
};

export interface CreateResult {
  readonly conversationId: string;
  /** The edge's own answer, when it refused before a conversation existed. */
  readonly refusal: Response | null;
}

/** The title is the head of what the caller wrote, and never empty. */
const createConversation = async (
  cookie: string,
  reqUuid: string,
  modelId: string,
  text: string,
  signal: AbortSignal | undefined
): Promise<CreateResult> => {
  const title = text.slice(0, TITLE_PREVIEW_LENGTH) || "hi";
  const response = await postAction(
    cookie,
    "/chat.data",
    `${config.origin}/chat`,
    {
      clientCreateRequestId: reqUuid,
      folderId: "",
      intent: "create-conversation",
      message: title,
      modelId,
    },
    signal
  );
  const conversationId = reqUuid
    .replaceAll("-", "")
    .slice(0, CONVERSATION_ID_LENGTH);
  /**
   * The title carries the head of the prompt, so the edge sees the caller's
   * text here first and can refuse the conversation itself. Sending the turn
   * anyway would address a conversation that was never opened, which reaches
   * the caller as a vaguer error than the one the edge already gave.
   */
  if (isEdgeRefusal(response.status)) {
    return { conversationId, refusal: response };
  }
  await drain(response);
  return { conversationId, refusal: null };
};

/**
 * Opens a conversation for work that does not go through send-message.
 *
 * A video job is submitted against a conversation the same way a turn is, so
 * it needs one opened first, and needs the edge's refusal handed back rather
 * than swallowed.
 */
export const openConversation = (
  cookie: string,
  modelId: string,
  title: string,
  signal: AbortSignal | undefined
): Promise<CreateResult> =>
  createConversation(cookie, crypto.randomUUID(), modelId, title, signal);

export const deleteConversation = async (
  cookie: string,
  conversationId: string
): Promise<void> => {
  try {
    const status = await drain(
      await postAction(
        cookie,
        "/actions/update-conversation.data",
        `${config.origin}/chat/${conversationId}`,
        { conversationId, intent: "delete" }
      )
    );
    if (status >= 400) {
      log.warn({ conversationId, msg: "delete rejected", status });
    }
  } catch (error) {
    log.warn({ conversationId, err: String(error), msg: "delete failed" });
  }
};

/** What the send-message body carries beyond the turn itself. */
export interface SendOptions {
  thinkingLevel?: ThinkingLevel;
  /** Read by the image models and ignored by the rest, exactly as the web UI sends it. */
  imageAspectRatio?: string;
  /**
   * Files to put in the bucket before the turn is sent. They cannot be uploaded
   * any earlier: `initiate` is scoped to a conversation, and the conversation
   * does not exist until the create call above has run.
   */
  readonly attachments?: readonly Attachment[];
}

export interface SendResult {
  readonly response: Response;
  readonly conversationId: string;
  /** False when the edge refused the create, so no conversation is upstream to delete. */
  readonly created: boolean;
}

/**
 * The send-message body. Each option is omitted rather than sent empty: the
 * upstream validates the body as a whole, so a field carrying a default nobody
 * asked for is a field that can fail the request.
 */
interface SendBody {
  messages: readonly AipassMessage[];
  modelId: string;
  imageAspectRatio?: string;
  thinkingLevel?: ThinkingLevel;
}

const sendBody = (
  modelId: string,
  messages: readonly AipassMessage[],
  options: SendOptions
): SendBody => {
  const body: SendBody = { messages, modelId };
  if (options.imageAspectRatio) {
    body.imageAspectRatio = options.imageAspectRatio;
  }
  if (options.thinkingLevel) {
    body.thinkingLevel = options.thinkingLevel;
  }
  return body;
};

const lastText = (messages: readonly AipassMessage[]): string =>
  messages.at(-1)?.parts.find((part) => part.type === "text")?.text ?? "";

/**
 * Files ride on the turn the caller wrote, ahead of its text: the composer puts
 * an attachment above the prompt, and a model reads what it was given before
 * what it was asked.
 */
const withFiles = (
  messages: readonly AipassMessage[],
  files: readonly AipassPart[]
): AipassMessage[] =>
  messages.map((message, index) =>
    index === messages.length - 1
      ? { ...message, parts: [...files, ...message.parts] }
      : message
  );

export const sendMessage = async (
  cookie: string,
  modelId: string,
  messages: readonly AipassMessage[],
  signal: AbortSignal | undefined,
  options: SendOptions = {}
): Promise<SendResult> => {
  const { conversationId, refusal } = await createConversation(
    cookie,
    crypto.randomUUID(),
    modelId,
    lastText(messages),
    signal
  );
  if (refusal) {
    return { conversationId, created: false, response: refusal };
  }
  /** Each upload holds its own token and reserved key, so they do not queue. */
  const uploaded: AipassPart[] = await Promise.all(
    (options.attachments ?? []).map(async (attachment): Promise<AipassPart> => {
      const file = await uploadAttachment(
        cookie,
        conversationId,
        modelId,
        attachment,
        signal
      );
      return {
        filename: file.filename,
        mediaType: file.mediaType,
        storageKey: file.storageKey,
        type: "file",
        url: file.storageKey,
      };
    })
  );
  const sent = uploaded.length > 0 ? withFiles(messages, uploaded) : messages;
  const response = await fetch(
    `${config.origin}/actions/send-message/${conversationId}`,
    {
      body: JSON.stringify(sendBody(modelId, sent, options)),
      headers: conversationJsonHeaders(cookie, conversationId),
      method: "POST",
      redirect: "manual",
      signal,
    }
  );
  return { conversationId, created: true, response };
};
