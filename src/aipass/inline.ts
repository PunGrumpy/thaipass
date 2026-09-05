import type { Attachment } from "./upload";

/**
 * A remote URL is refused rather than fetched: a deployment that fetches any
 * URL a caller names is a request forger for the network it sits in.
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

export const nameFor = (mediaType: string, index: number): string => {
  const subtype = mediaType.split("/")[1]?.split(";")[0] ?? "bin";
  const extension = subtype === "jpeg" ? "jpg" : subtype;
  const kind = mediaType.startsWith("image/") ? "image" : "attachment";
  return `${kind}-${index + 1}.${extension}`;
};

/** Percent-encoded data URIs are decoded too; small SVG and text files arrive that way. */
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
