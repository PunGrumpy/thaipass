import { z } from "zod";

import type { MediaAsset } from "../aipass/media";
import { musicModelSchema } from "../aipass/models";
import { creditUsageSchema } from "../aipass/quotas";
import type { CreditUsage } from "../aipass/quotas";
import {
  assetDatum,
  assetDatumSchema,
  createdNow,
  mediaFormatSchema,
} from "./media";
import type { MediaFormat } from "./media";

/**
 * Music, in the same shape images come back in.
 *
 * OpenAI's own audio endpoint is text-to-speech, which is a different thing
 * with a different body, so matching its name would be a false friend. This
 * keeps the shape the rest of this proxy's media uses instead.
 */

export const audioRequestSchema = z.object({
  model: musicModelSchema,
  prompt: z.string().min(1),
  response_format: mediaFormatSchema.optional(),
});

export type AudioRequest = z.infer<typeof audioRequestSchema>;

export const audioResponseSchema = z.object({
  created: z.number(),
  data: z.array(assetDatumSchema.extend({ media_type: z.string() })),
  usage: z.object({ credits: creditUsageSchema.optional() }).optional(),
});

export type AudioResponse = z.infer<typeof audioResponseSchema>;

export const toAudioResponse = (
  assets: readonly MediaAsset[],
  format: MediaFormat,
  credits: CreditUsage | undefined
): AudioResponse => ({
  created: createdNow(),
  data: assets.map((asset) => ({
    media_type: asset.mediaType,
    ...assetDatum(asset, format),
  })),
  usage: credits ? { credits } : undefined,
});
