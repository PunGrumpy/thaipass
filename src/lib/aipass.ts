import { config } from "./config.ts";
import type { AipassMessage } from "./translate.ts";

const CONVERSATION_ID_LENGTH = 16;
const TITLE_PREVIEW_LENGTH = 400;

const browserHeaders = (referer: string, contentType: string) => ({
  accept: "*/*",
  "accept-language": "th-TH,th;q=0.9,en;q=0.8",
  "content-type": contentType,
  cookie: config.cookie,
  origin: config.origin,
  referer,
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent": config.userAgent,
});

/**
 * POST a form-encoded React Router action and drain the response. These actions
 * are called for their side effect only, so the body is read and discarded to
 * free the connection.
 */
const postAction = async (
  path: string,
  referer: string,
  fields: Record<string, string>,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetch(`${config.origin}${path}`, {
    body: new URLSearchParams(fields).toString(),
    headers: browserHeaders(
      referer,
      "application/x-www-form-urlencoded;charset=UTF-8"
    ),
    method: "POST",
    redirect: "manual",
    signal,
  });
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
};

/**
 * Create a fresh conversation via `intent=create-conversation`. The conversation
 * id is the first 16 hex chars of the client-generated UUID.
 */
const createConversation = async (
  reqUuid: string,
  modelId: string,
  title: string,
  signal: AbortSignal | undefined
): Promise<string> => {
  await postAction(
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
  return reqUuid.replaceAll("-", "").slice(0, CONVERSATION_ID_LENGTH);
};

/**
 * Delete a throwaway conversation so the account's chat list does not fill with
 * one entry per request. Fire-and-forget: failures are swallowed.
 */
export const deleteConversation = async (
  conversationId: string
): Promise<void> => {
  try {
    await postAction(
      "/actions/update-conversation.data",
      `${config.origin}/chat/${conversationId}`,
      { conversationId, intent: "delete" }
    );
  } catch {
    // best effort
  }
};

export interface SendResult {
  readonly response: Response;
  readonly conversationId: string;
}

/**
 * Create a fresh conversation, then stream the assistant's reply for the given
 * (already flattened) messages. The caller owns cleanup via `deleteConversation`.
 */
export const sendMessage = async (
  modelId: string,
  messages: readonly AipassMessage[],
  signal: AbortSignal | undefined
): Promise<SendResult> => {
  const reqUuid = crypto.randomUUID();
  const preview = (messages.at(-1)?.parts[0]?.text ?? "").slice(
    0,
    TITLE_PREVIEW_LENGTH
  );
  const conversationId = await createConversation(
    reqUuid,
    modelId,
    preview.length > 0 ? preview : "hi",
    signal
  );
  const response = await fetch(
    `${config.origin}/actions/send-message/${conversationId}`,
    {
      body: JSON.stringify({ messages, modelId }),
      headers: browserHeaders(
        `${config.origin}/chat/${conversationId}`,
        "application/json"
      ),
      method: "POST",
      // a 302 -> /sign-in means the cookie is stale
      redirect: "manual",
      signal,
    }
  );
  return { conversationId, response };
};
