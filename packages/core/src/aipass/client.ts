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
   * The title carries the head of the prompt, so the edge can refuse the
   * conversation here before any turn is sent.
   */
  if (isEdgeRefusal(response.status)) {
    return { conversationId, refusal: response };
  }
  await drain(response);
  return { conversationId, refusal: null };
};

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
      config.logger?.warn({ conversationId, msg: "delete rejected", status });
    }
  } catch (error) {
    config.logger?.warn({
      conversationId,
      err: String(error),
      msg: "delete failed",
    });
  }
};

export interface SendOptions {
  thinkingLevel?: ThinkingLevel;
  /** Read by the image models and ignored by the rest, exactly as the web UI sends it. */
  imageAspectRatio?: string;
  /** Uploaded after the create call: `initiate` is scoped to a conversation. */
  readonly attachments?: readonly Attachment[];
}

export interface SendResult {
  readonly response: Response;
  readonly conversationId: string;
  /** False when the edge refused the create, so no conversation is upstream to delete. */
  readonly created: boolean;
}

/** Each option is omitted rather than sent empty; the upstream validates the whole body. */
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

/** The composer puts attachments above the prompt, so files go first. */
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
