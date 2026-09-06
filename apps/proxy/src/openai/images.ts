import type { MediaAsset } from "@thaipass/core/aipass/media";
import { imageModelSchema } from "@thaipass/core/aipass/models";
import type { CreditUsage } from "@thaipass/core/aipass/quotas";
import { creditUsageSchema } from "@thaipass/core/aipass/quotas";
import { z } from "zod";

import { assetDatum, createdNow, mediaFormatSchema } from "./media";
import type { MediaFormat } from "./media";

/**
 * OpenAI describes an image by pixel size and AI Pass by shape, so `size` is
 * rounded to the nearest offered ratio; `aspect_ratio` names it outright.
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
  response_format: mediaFormatSchema.optional(),
  size: z.string().optional(),
});

export type ImageRequest = z.infer<typeof imageRequestSchema>;

export const imageResponseSchema = z.object({
  created: z.number(),
  data: z.array(
    z.object({
      b64_json: z.string().optional(),
      /** Carries the reason when the file stayed a link. */
      revised_prompt: z.string().optional(),
      url: z.string().optional(),
    })
  ),
  usage: z.object({ credits: creditUsageSchema.optional() }).optional(),
});

export type ImageResponse = z.infer<typeof imageResponseSchema>;

export const aspectRatioFor = (body: ImageRequest): string | undefined =>
  body.aspect_ratio ?? (body.size ? ratioForSize(body.size) : undefined);

/** `revised_prompt` is the only free text the OpenAI shape has room for. */
export const toImageResponse = (
  assets: readonly MediaAsset[],
  format: MediaFormat,
  credits: CreditUsage | undefined
): ImageResponse => ({
  created: createdNow(),
  data: assets.map((asset) => {
    const { note, ...datum } = assetDatum(asset, format);
    return note ? { ...datum, revised_prompt: note } : datum;
  }),
  usage: credits ? { credits } : undefined,
});
