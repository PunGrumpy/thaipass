import { log } from "evlog";

import { config } from "../lib/config";
import { isEdgeRefusal } from "./refusal";
import { browserPostHeaders } from "./request";
import type { AipassMessage } from "./stream";

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

interface CreateResult {
  readonly conversationId: string;
  /** The edge's own answer, when it refused before a conversation existed. */
  readonly refusal: Response | null;
}

const createConversation = async (
  cookie: string,
  reqUuid: string,
  modelId: string,
  title: string,
  signal: AbortSignal | undefined
): Promise<CreateResult> => {
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

export interface SendResult {
  readonly response: Response;
  readonly conversationId: string;
  /** False when the edge refused the create, so no conversation is upstream to delete. */
  readonly created: boolean;
}

export const sendMessage = async (
  cookie: string,
  modelId: string,
  messages: readonly AipassMessage[],
  signal: AbortSignal | undefined
): Promise<SendResult> => {
  const reqUuid = crypto.randomUUID();
  const preview = (messages.at(-1)?.parts[0]?.text ?? "").slice(
    0,
    TITLE_PREVIEW_LENGTH
  );
  const { conversationId, refusal } = await createConversation(
    cookie,
    reqUuid,
    modelId,
    preview.length > 0 ? preview : "hi",
    signal
  );
  if (refusal) {
    return { conversationId, created: false, response: refusal };
  }
  const response = await fetch(
    `${config.origin}/actions/send-message/${conversationId}`,
    {
      body: JSON.stringify({ messages, modelId }),
      headers: browserPostHeaders(
        cookie,
        `${config.origin}/chat/${conversationId}`,
        "application/json"
      ),
      method: "POST",
      redirect: "manual",
      signal,
    }
  );
  return { conversationId, created: true, response };
};
