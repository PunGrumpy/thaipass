import { z } from "zod";

import type { MediaAsset } from "../aipass/media";
import { imageModelSchema } from "../aipass/models";
import type { CreditUsage } from "../aipass/quotas";
import { creditUsageSchema } from "../aipass/quotas";

/**
 * The OpenAI images surface, over the one aspect ratio AI Pass accepts.
 *
 * OpenAI describes an image by its pixel size and AI Pass by its shape, so a
 * `size` is reduced to the nearest ratio the web UI offers rather than being
 * passed through. A caller who would rather say the shape can send
 * `aspect_ratio` and skip the guess.
 */

interface Ratio {
  readonly ratio: string;
  readonly value: number;
}

const RATIOS: readonly Ratio[] = [
  { ratio: "1:1", value: 1 },
  { ratio: "3:4", value: 3 / 4 },
  { ratio: "4:3", value: 4 / 3 },
];

export const ASPECT_RATIOS = RATIOS.map((entry) => entry.ratio);

const SIZE = /^(?<width>\d+)x(?<height>\d+)$/u;

/** The offered ratio closest to what the caller asked for, by shape not by area. */
export const ratioForSize = (size: string): string | undefined => {
  const match = SIZE.exec(size);
  const width = Number(match?.groups?.width);
  const height = Number(match?.groups?.height);
  if (!(Number.isFinite(width) && Number.isFinite(height)) || height === 0) {
    return undefined;
  }
  const wanted = width / height;
  let best: Ratio | undefined;
  for (const entry of RATIOS) {
    if (
      !best ||
      Math.abs(entry.value - wanted) < Math.abs(best.value - wanted)
    ) {
      best = entry;
    }
  }
  return best?.ratio;
};

export const imageRequestSchema = z.object({
  aspect_ratio: z.enum(["1:1", "3:4", "4:3"]).optional(),
  model: imageModelSchema,
  n: z.number().int().min(1).optional(),
  prompt: z.string().min(1),
  response_format: z.enum(["b64_json", "url"]).optional(),
  size: z.string().optional(),
});

export type ImageRequest = z.infer<typeof imageRequestSchema>;

export const imageResponseSchema = z.object({
  created: z.number(),
  data: z.array(
    z.object({
      b64_json: z.string().optional(),
      /** Set instead of the bytes when the file was too big to carry, or unreadable. */
      revised_prompt: z.string().optional(),
      url: z.string().optional(),
    })
  ),
  usage: z.object({ credits: creditUsageSchema.optional() }).optional(),
});

export type ImageResponse = z.infer<typeof imageResponseSchema>;

export const aspectRatioFor = (body: ImageRequest): string | undefined =>
  body.aspect_ratio ?? (body.size ? ratioForSize(body.size) : undefined);

const MS_PER_SECOND = 1000;

/**
 * An inline asset is handed back as base64 unless the caller asked for a URL;
 * one that stayed a link is handed back as a link whatever they asked for,
 * with the reason in `revised_prompt`, which is the only free text the shape
 * has room for.
 */
export const toImageResponse = (
  assets: readonly MediaAsset[],
  format: "b64_json" | "url",
  credits: CreditUsage | undefined
): ImageResponse => ({
  created: Math.floor(Date.now() / MS_PER_SECOND),
  data: assets.map((asset) => {
    if (!asset.inline) {
      return asset.note
        ? { revised_prompt: asset.note, url: asset.href }
        : { url: asset.href };
    }
    return format === "url"
      ? { url: asset.href }
      : { b64_json: asset.href.slice(asset.href.indexOf(",") + 1) };
  }),
  usage: credits ? { credits } : undefined,
});
