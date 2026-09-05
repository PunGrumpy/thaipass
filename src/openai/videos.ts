import { z } from "zod";

import type { MediaAsset } from "../aipass/media";
import { videoModelSchema } from "../aipass/models";
import { creditUsageSchema } from "../aipass/quotas";
import type { CreditUsage } from "../aipass/quotas";

/**
 * The video surface. There is no OpenAI shape to copy that AI Pass fits, so
 * this is the images shape with the fields a video actually takes, and it says
 * plainly that the call blocks until the render is done.
 */

export const videoRequestSchema = z.object({
  aspect_ratio: z.string().optional(),
  camera_fixed: z.boolean().optional(),
  duration: z.number().int().positive().optional(),
  generate_audio: z.boolean().optional(),
  model: videoModelSchema,
  prompt: z.string().min(1),
  resolution: z.string().optional(),
  response_format: z.enum(["b64_json", "url"]).optional(),
  style_preprompt: z.string().optional(),
});

export type VideoRequestBody = z.infer<typeof videoRequestSchema>;

export const videoResponseSchema = z.object({
  created: z.number(),
  data: z.array(
    z.object({
      b64_json: z.string().optional(),
      note: z.string().optional(),
      url: z.string().optional(),
    })
  ),
  job_id: z.string(),
  /** Set when AI Pass ran the job on a different model, which it does when one is busy. */
  model: z.string().optional(),
  usage: z.object({ credits: creditUsageSchema.optional() }).optional(),
});

export type VideoResponse = z.infer<typeof videoResponseSchema>;

const MS_PER_SECOND = 1000;

export const toVideoResponse = (
  asset: MediaAsset,
  jobId: string,
  format: "b64_json" | "url",
  servedModel: string | undefined,
  credits: CreditUsage | undefined
): VideoResponse => {
  const datum = (() => {
    if (!asset.inline) {
      return asset.note
        ? { note: asset.note, url: asset.href }
        : { url: asset.href };
    }
    return format === "url"
      ? { url: asset.href }
      : { b64_json: asset.href.slice(asset.href.indexOf(",") + 1) };
  })();
  return {
    created: Math.floor(Date.now() / MS_PER_SECOND),
    data: [datum],
    job_id: jobId,
    model: servedModel,
    usage: credits ? { credits } : undefined,
  };
};
