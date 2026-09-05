import type { Attachment } from "./upload";

/**
 * Bytes a caller sent inline, in the two shapes the protocols use.
 *
 * OpenAI carries a file as a data URI; Anthropic carries base64 beside a media
 * type. Both end up here, and a remote URL does not: fetching one server-side
 * would make this proxy a request forger for whatever network it is deployed
 * into, so it is refused with a reason instead.
 */

const DATA_URI = /^data:(?<mediaType>[^;,]*)(?<base64>;base64)?,/iu;

export class InlineError extends Error {
  override name = "InlineError";
}

/** atob yields one byte per code unit, so every code point here is below 256. */
const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
};

export const fromBase64 = (
  data: string,
  mediaType: string,
  filename: string
): Attachment => {
  try {
    return { bytes: decodeBase64(data), filename, mediaType };
  } catch {
    throw new InlineError(`${filename} is not readable base64`);
  }
};

/** A default name for a file the caller did not name, from what it is. */
export const nameFor = (mediaType: string, index: number): string => {
  const subtype = mediaType.split("/")[1]?.split(";")[0] ?? "bin";
  const extension = subtype === "jpeg" ? "jpg" : subtype;
  const kind = mediaType.startsWith("image/") ? "image" : "attachment";
  return `${kind}-${index + 1}.${extension}`;
};

/**
 * A data URI becomes an attachment; anything else names why it cannot.
 *
 * A percent-encoded (non-base64) data URI is decoded too — small SVG and text
 * attachments arrive that way, and refusing them would be arbitrary.
 */
export const fromDataUri = (
  uri: string,
  filename?: string,
  index = 0
): Attachment => {
  const match = DATA_URI.exec(uri);
  if (!match) {
    throw new InlineError(
      "only inline data is accepted; send the file as a data: URI or base64, not as a URL the proxy would have to fetch"
    );
  }
  const mediaType = match.groups?.mediaType || "application/octet-stream";
  const payload = uri.slice(match[0].length);
  /** Named from what it turned out to be, which is only known once parsed. */
  const name = filename ?? nameFor(mediaType, index);
  if (match.groups?.base64) {
    return fromBase64(payload, mediaType, name);
  }
  return {
    bytes: new TextEncoder().encode(decodeURIComponent(payload)),
    filename: name,
    mediaType,
  };
};
