import { z } from "zod";

import type { MediaAsset } from "../aipass/media";
import { videoModelSchema } from "../aipass/models";
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
  response_format: mediaFormatSchema.optional(),
  style_preprompt: z.string().optional(),
});

export type VideoRequestBody = z.infer<typeof videoRequestSchema>;

export const videoResponseSchema = z.object({
  created: z.number(),
  data: z.array(assetDatumSchema),
  job_id: z.string(),
  /** Set when AI Pass ran the job on a different model, which it does when one is busy. */
  model: z.string().optional(),
  usage: z.object({ credits: creditUsageSchema.optional() }).optional(),
});

export type VideoResponse = z.infer<typeof videoResponseSchema>;

export const toVideoResponse = (
  asset: MediaAsset,
  jobId: string,
  format: MediaFormat,
  servedModel: string | undefined,
  credits: CreditUsage | undefined
): VideoResponse => ({
  created: createdNow(),
  data: [assetDatum(asset, format)],
  job_id: jobId,
  model: servedModel,
  usage: credits ? { credits } : undefined,
});
