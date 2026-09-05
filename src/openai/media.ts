import { z } from "zod";

import { inlineBase64 } from "../aipass/media";
import type { MediaAsset } from "../aipass/media";

export const mediaFormatSchema = z.enum(["b64_json", "url"]);

export type MediaFormat = z.infer<typeof mediaFormatSchema>;

export const assetDatumSchema = z.object({
  b64_json: z.string().optional(),
  note: z.string().optional(),
  url: z.string().optional(),
});

export type AssetDatum = z.infer<typeof assetDatumSchema>;

const MS_PER_SECOND = 1000;

export const createdNow = (): number => Math.floor(Date.now() / MS_PER_SECOND);

/** A link stays a link whatever format was asked for, with the reason beside it. */
export const assetDatum = (
  asset: MediaAsset,
  format: MediaFormat
): AssetDatum => {
  if (!asset.inline) {
    return asset.note
      ? { note: asset.note, url: asset.href }
      : { url: asset.href };
  }
  return format === "url"
    ? { url: asset.href }
    : { b64_json: inlineBase64(asset) };
};
