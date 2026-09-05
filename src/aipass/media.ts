import { z } from "zod";

import { config } from "../lib/config";
import { browserGetHeaders } from "./request";

export type MediaKind = "image" | "video" | "audio" | "file";

const INLINE_CAP = {
  audio: 25 * 1024 * 1024,
  file: 10 * 1024 * 1024,
  image: 5 * 1024 * 1024,
  video: 50 * 1024 * 1024,
} satisfies Record<MediaKind, number>;

/** Music carries `url`; video carries only `snapshotUrl`, so both are read. */
export const fileEventSchema = z.object({
  filename: z.string().optional(),
  mediaType: z.string().optional(),
  snapshotUrl: z.string().optional(),
  url: z.string().optional(),
});

export type FileEvent = z.infer<typeof fileEventSchema>;

export interface MediaAsset {
  readonly kind: MediaKind;
  readonly mediaType: string;
  readonly filename: string;
  readonly href: string;
  readonly inline: boolean;
  readonly note?: string;
}

export const kindOfMediaType = (mediaType: string): MediaKind => {
  if (mediaType.startsWith("image/")) {
    return "image";
  }
  if (mediaType.startsWith("video/")) {
    return "video";
  }
  return mediaType.startsWith("audio/") ? "audio" : "file";
};

const EXTENSIONS = {
  audio: "mp3",
  file: "bin",
  image: "png",
  video: "mp4",
} satisfies Record<MediaKind, string>;

const nameFor = (kind: MediaKind, mediaType: string): string => {
  const subtype = mediaType.split("/")[1]?.split(";")[0];
  return `${kind}.${subtype ?? EXTENSIONS[kind]}`;
};

const toDataUri = (bytes: ArrayBuffer, mediaType: string): string =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;

const isAbsolute = (url: string): boolean => /^https?:\/\//iu.test(url);

export const inlineBase64 = (asset: MediaAsset): string =>
  asset.href.slice(asset.href.indexOf(",") + 1);

export const renderAsset = (asset: MediaAsset): string => {
  const link = asset.kind === "image" ? "!" : "";
  const note = asset.note ? `\n\n_${asset.note}_` : "";
  return `\n\n${link}[${asset.filename}](${asset.href})${note}\n\n`;
};

/**
 * Only a same-origin asset is fetched; an absolute URL elsewhere is public
 * or needs its own credential, and is not this proxy's to get.
 */
export const resolveAsset = async (
  cookie: string,
  event: FileEvent,
  signal: AbortSignal | undefined
): Promise<MediaAsset | null> => {
  const url = event.url ?? event.snapshotUrl;
  if (!url) {
    return null;
  }
  const mediaType = event.mediaType ?? "application/octet-stream";
  const kind = kindOfMediaType(mediaType);
  const filename = event.filename ?? nameFor(kind, mediaType);
  const base = { filename, kind, mediaType };

  if (url.startsWith("data:")) {
    return { ...base, href: url, inline: true };
  }
  const absolute = new URL(url, config.origin).href;
  if (isAbsolute(url) && !absolute.startsWith(config.origin)) {
    return { ...base, href: absolute, inline: false };
  }

  const needsLogin =
    "the file is over the size the proxy will carry inline, so this link needs a logged-in browser";
  try {
    const response = await fetch(absolute, {
      headers: browserGetHeaders(cookie, `${config.origin}/chat`),
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      return {
        ...base,
        href: absolute,
        inline: false,
        note: `the proxy could not read the file (${response.status}); this link needs a logged-in browser`,
      };
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > INLINE_CAP[kind]) {
      return { ...base, href: absolute, inline: false, note: needsLogin };
    }
    return { ...base, href: toDataUri(bytes, mediaType), inline: true };
  } catch (error) {
    return {
      ...base,
      href: absolute,
      inline: false,
      note: `the proxy could not read the file (${error}); this link needs a logged-in browser`,
    };
  }
};
