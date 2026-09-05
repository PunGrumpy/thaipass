import { z } from "zod";

import type { MediaAsset } from "../aipass/media";
import { musicModelSchema } from "../aipass/models";
import { creditUsageSchema } from "../aipass/quotas";
import type { CreditUsage } from "../aipass/quotas";

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
  response_format: z.enum(["b64_json", "url"]).optional(),
});

export type AudioRequest = z.infer<typeof audioRequestSchema>;

export const audioResponseSchema = z.object({
  created: z.number(),
  data: z.array(
    z.object({
      b64_json: z.string().optional(),
      media_type: z.string(),
      note: z.string().optional(),
      url: z.string().optional(),
    })
  ),
  usage: z.object({ credits: creditUsageSchema.optional() }).optional(),
});

export type AudioResponse = z.infer<typeof audioResponseSchema>;

const MS_PER_SECOND = 1000;

export const toAudioResponse = (
  assets: readonly MediaAsset[],
  format: "b64_json" | "url",
  credits: CreditUsage | undefined
): AudioResponse => ({
  created: Math.floor(Date.now() / MS_PER_SECOND),
  data: assets.map((asset) => {
    const base = { media_type: asset.mediaType };
    if (!asset.inline) {
      return asset.note
        ? { ...base, note: asset.note, url: asset.href }
        : { ...base, url: asset.href };
    }
    return format === "url"
      ? { ...base, url: asset.href }
      : {
          ...base,
          b64_json: asset.href.slice(asset.href.indexOf(",") + 1),
        };
  }),
  usage: credits ? { credits } : undefined,
});
