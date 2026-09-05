import type { z } from "zod";

import { deleteConversation, openConversation } from "../aipass/client";
import { resolveAsset } from "../aipass/media";
import type { MediaAsset } from "../aipass/media";
import type { VideoModel } from "../aipass/models";
import { fetchCredits, settleCredits } from "../aipass/quotas";
import type { CreditUsage } from "../aipass/quotas";
import {
  cancelVideo,
  explainVideoError,
  jobStateSchema,
  POLL_INTERVAL_MS,
  pollVideo,
  submitVideo,
  startedSchema,
  videoBody,
} from "../aipass/video";
import type { VideoOptions } from "../aipass/video";
import { DETAIL_LIMIT, MediaError } from "./generate";

/**
 * A video, from submitted job to finished file.
 *
 * The upstream has no streaming variant, so this waits: it submits, polls
 * until the job reports completed, then reads the asset the way every other
 * generated file is read. A job that fails or is abandoned is cancelled rather
 * than left running, because a running job keeps spending the video quota.
 */

export interface VideoRequest {
  readonly cookie: string;
  readonly modelId: VideoModel;
  readonly prompt: string;
  readonly options: VideoOptions;
  readonly signal: AbortSignal | undefined;
  /** How long to wait before giving up on a job that never finishes. */
  readonly timeoutMs: number;
}

export interface VideoResult {
  readonly asset: MediaAsset;
  readonly jobId: string;
  /** Set when AI Pass ran the job on a different model than the one asked for. */
  readonly servedModel?: string;
  readonly credits?: CreditUsage;
}

const readJson = async <T>(
  response: Response,
  schema: z.ZodType<T>,
  step: string
): Promise<T> => {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new MediaError(
      `video ${step} returned ${response.status}`,
      response.status,
      detail.slice(0, DETAIL_LIMIT)
    );
  }
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new MediaError(`video ${step} answered in an unreadable shape`, 502);
  }
  return parsed.data;
};

const CALLER_GONE = 499;

/** Waits between polls, and gives up early when the caller has gone. */
const sleep = async (
  ms: number,
  signal: AbortSignal | undefined
): Promise<void> => {
  const waited = Promise.withResolvers<true>();
  const timer = setTimeout(() => waited.resolve(true), ms);
  signal?.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      waited.reject(new MediaError("the caller went away", CALLER_GONE));
    },
    { once: true }
  );
  await waited.promise;
};

export const generateVideo = async (
  request: VideoRequest
): Promise<VideoResult> => {
  const { cookie, modelId, options, prompt, signal, timeoutMs } = request;
  const pending = fetchCredits(cookie, signal);
  const { conversationId, refusal } = await openConversation(
    cookie,
    modelId,
    prompt,
    signal
  );
  if (refusal) {
    const detail = await refusal.text().catch(() => "");
    throw new MediaError(
      `upstream ${refusal.status} refused the conversation`,
      refusal.status,
      detail.slice(0, DETAIL_LIMIT)
    );
  }

  let jobId = "";
  try {
    const body = videoBody(conversationId, modelId, prompt, options);
    const started = await readJson(
      await submitVideo(cookie, body, signal),
      startedSchema,
      "submit"
    );
    if (started.error) {
      throw new MediaError(explainVideoError(started.error), 502);
    }
    const { jobId: startedJob } = started;
    if (!startedJob) {
      throw new MediaError("video submit returned no job id", 502);
    }
    jobId = startedJob;

    const deadline = Date.now() + timeoutMs;
    /**
     * Polling is sequential by nature: each read decides whether there is
     * another, so there is no set of promises to run together here.
     */
    // oxlint-disable no-await-in-loop
    for (;;) {
      await sleep(POLL_INTERVAL_MS, signal);
      const state = await readJson(
        await pollVideo(cookie, conversationId, jobId, signal),
        jobStateSchema,
        "poll"
      );
      if (state.status === "completed") {
        const url = state.videoUrl ?? state.url;
        if (!url) {
          throw new MediaError("the job completed without a video url", 502);
        }
        const asset = await resolveAsset(
          cookie,
          { filename: `${jobId}.mp4`, mediaType: "video/mp4", url },
          signal
        );
        if (!asset) {
          throw new MediaError("the finished video could not be read", 502);
        }
        const { usage } = await settleCredits(cookie, pending);
        return {
          asset,
          credits: usage,
          jobId,
          servedModel: started.autoSwitched ? started.modelId : undefined,
        };
      }
      if (state.status === "failed" || state.error) {
        throw new MediaError(
          explainVideoError(state.error ?? "video generation failed"),
          502
        );
      }
      if (Date.now() > deadline) {
        throw new MediaError(
          `the video was still rendering after ${Math.round(timeoutMs / 1000)}s; the job is cancelled and the credits are spent`,
          504
        );
      }
    }
    // oxlint-enable no-await-in-loop
  } catch (error) {
    if (jobId) {
      await cancelVideo(cookie, conversationId, jobId);
    }
    throw error;
  } finally {
    await deleteConversation(cookie, conversationId);
  }
};
