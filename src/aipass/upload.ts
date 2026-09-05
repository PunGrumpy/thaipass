import { z } from "zod";

import { config } from "../lib/config";
import { conversationJsonHeaders } from "./request";

/**
 * Three calls: `initiate` reserves a place and answers with a signed bucket
 * URL, the bytes go there with a plain PUT and no cookie, and `confirm` tells
 * AI Pass the object landed. Only the storage key travels on the message.
 */

const INITIATE_PATH = "/actions/upload-file/initiate";
const CONFIRM_PATH = "/actions/upload-file/confirm";

/** What the upstream composer accepts. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface Attachment {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mediaType: string;
  readonly filename: string;
}

export interface UploadedFile {
  readonly storageKey: string;
  readonly mediaType: string;
  readonly filename: string;
}

const initiateSchema = z.object({
  error: z.string().optional(),
  sizeBytes: z.number().optional(),
  storageKey: z.string(),
  uploadToken: z.string(),
  uploadUrl: z.string(),
});

const confirmSchema = z.object({
  error: z.string().optional(),
  storageKey: z.string().optional(),
});

export class UploadError extends Error {
  override name = "UploadError";
}

const readJson = async <T>(
  response: Response,
  schema: z.ZodType<T>,
  step: string
): Promise<T> => {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new UploadError(
      `upload ${step} returned ${response.status}: ${detail.slice(0, 200)}`
    );
  }
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new UploadError(`upload ${step} answered in an unreadable shape`);
  }
  return parsed.data;
};

/** The bucket answers 412 when a retry re-sends bytes that already landed. */
const PRECONDITION_FAILED = 412;

export const uploadAttachment = async (
  cookie: string,
  conversationId: string,
  modelId: string,
  attachment: Attachment,
  signal: AbortSignal | undefined
): Promise<UploadedFile> => {
  const { bytes, filename, mediaType } = attachment;
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new UploadError(
      `${filename} is ${bytes.length} bytes, over the ${MAX_ATTACHMENT_BYTES} byte limit`
    );
  }
  const initiated = await readJson(
    await fetch(`${config.origin}${INITIATE_PATH}`, {
      body: JSON.stringify({
        contentFilename: filename,
        contentType: mediaType,
        conversationId,
        filename,
        modelId,
        sizeBytes: bytes.length,
      }),
      headers: conversationJsonHeaders(cookie, conversationId),
      method: "POST",
      redirect: "manual",
      signal,
    }),
    initiateSchema,
    "initiate"
  );
  if (initiated.error) {
    throw new UploadError(`upload initiate refused: ${initiated.error}`);
  }

  /** The bucket enforces the reserved size only when it named one. */
  interface PutHeaders {
    "content-type": string;
    "x-goog-content-length-range"?: string;
    "x-goog-if-generation-match"?: string;
  }
  const putHeaders: PutHeaders = { "content-type": mediaType };
  if (initiated.sizeBytes !== undefined) {
    putHeaders["x-goog-content-length-range"] =
      `${initiated.sizeBytes},${initiated.sizeBytes}`;
    putHeaders["x-goog-if-generation-match"] = "0";
  }
  const put = await fetch(initiated.uploadUrl, {
    body: new Blob([bytes], { type: mediaType }),
    headers: new Headers(Object.entries(putHeaders)),
    method: "PUT",
    signal,
  });
  await put.arrayBuffer().catch(() => new ArrayBuffer(0));
  if (!put.ok && put.status !== PRECONDITION_FAILED) {
    throw new UploadError(`upload PUT returned ${put.status}`);
  }

  const confirmed = await readJson(
    await fetch(`${config.origin}${CONFIRM_PATH}`, {
      body: JSON.stringify({ uploadToken: initiated.uploadToken }),
      headers: conversationJsonHeaders(cookie, conversationId),
      method: "POST",
      redirect: "manual",
      signal,
    }),
    confirmSchema,
    "confirm"
  );
  if (confirmed.error) {
    throw new UploadError(`upload confirm refused: ${confirmed.error}`);
  }
  return {
    filename,
    mediaType,
    storageKey: confirmed.storageKey ?? initiated.storageKey,
  };
};
