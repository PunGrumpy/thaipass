import { z } from "zod";

import { config } from "../lib/config";
import type { VideoModel } from "./models";
import { browserGetHeaders, conversationJsonHeaders } from "./request";

/**
 * Video is a different protocol from everything else AI Pass serves.
 *
 * Chat, images and music stream back from send-message; a video is submitted
 * as a job to `/actions/video-generation`, then polled until it reports
 * completed. There is no streaming variant, so nothing here pretends there is.
 *
 * A job left running keeps burning the account's video quota, so one is
 * cancelled on the way out of a failure rather than abandoned.
 */

const VIDEO_PATH = "/actions/video-generation";

export const POLL_INTERVAL_MS = 2000;

/** Which providers the video ids belong to, matched the way the web client does. */
const PROVIDERS: readonly (readonly [string, RegExp])[] = [
  ["seedance", /^seedance/iu],
  ["veo", /^veo/iu],
  ["sora", /^sora/iu],
  ["wan", /^wan/iu],
];

export const providerFor = (modelId: string): string | undefined =>
  PROVIDERS.find(([, pattern]) => pattern.test(modelId))?.[0];

/**
 * The only option the app gates by model. Everything else it sends whenever
 * the caller set it, so this mirrors that rather than inventing stricter rules.
 */
const RESOLUTIONS = new Map<string, readonly string[]>([
  ["seedance-2.0-fast", ["480p", "720p"]],
  ["seedance-2.0-mini", ["480p", "720p"]],
]);

export const resolutionsFor = (modelId: string): readonly string[] | null =>
  RESOLUTIONS.get(modelId) ?? null;

const isSeedance = (modelId: string): boolean =>
  providerFor(modelId) === "seedance";

export interface VideoOptions {
  readonly aspectRatio?: string;
  readonly stylePreprompt?: string;
  readonly resolution?: string;
  readonly duration?: number;
  readonly cameraFixed?: boolean;
  readonly generateAudio?: boolean;
}

/** What this model will actually take, so a client can ask rather than guess. */
export const optionsFor = (modelId: VideoModel) => ({
  aspectRatio: true,
  cameraFixed: isSeedance(modelId),
  duration: isSeedance(modelId),
  generateAudio: isSeedance(modelId),
  provider: providerFor(modelId) ?? null,
  resolutions: resolutionsFor(modelId),
  stylePreprompt: true,
});

interface VideoBody {
  conversationId: string;
  modelId: string;
  prompt: string;
  provider?: string;
  aspectRatio?: string;
  stylePreprompt?: string;
  resolution?: string;
  duration?: number;
  cameraFixed?: boolean;
  generateAudio?: boolean;
}

/**
 * Only what the caller actually set, and only what this model takes. The route
 * validates the body as a whole and answers "Invalid request body" with no
 * field named, so sending an option a model does not accept costs a request
 * with nothing to go on.
 */
export const videoBody = (
  conversationId: string,
  modelId: VideoModel,
  prompt: string,
  options: VideoOptions
): VideoBody => {
  const body: VideoBody = { conversationId, modelId, prompt };
  const provider = providerFor(modelId);
  if (provider) {
    body.provider = provider;
  }
  if (options.aspectRatio) {
    body.aspectRatio = options.aspectRatio;
  }
  if (options.stylePreprompt) {
    body.stylePreprompt = options.stylePreprompt;
  }
  const allowed = resolutionsFor(modelId);
  if (options.resolution && allowed?.includes(options.resolution)) {
    body.resolution = options.resolution;
  }
  if (isSeedance(modelId)) {
    if (options.duration !== undefined && options.duration > 0) {
      body.duration = options.duration;
    }
    if (options.cameraFixed !== undefined) {
      body.cameraFixed = options.cameraFixed;
    }
    if (options.generateAudio !== undefined) {
      body.generateAudio = options.generateAudio;
    }
  }
  return body;
};

export const startedSchema = z.object({
  autoSwitched: z.boolean().optional(),
  error: z.string().optional(),
  jobId: z.string().optional(),
  modelId: z.string().optional(),
});

export const jobStateSchema = z.object({
  error: z.string().optional(),
  progress: z.number().optional(),
  status: z.string().optional(),
  url: z.string().optional(),
  videoUrl: z.string().optional(),
});

export type JobState = z.infer<typeof jobStateSchema>;

/**
 * The codes are terse and the web UI expands them in Thai. A caller reading
 * JSON gets neither, so the actionable part is spelled out.
 */
const ERROR_HINTS = new Map([
  ["conflictActive", "another video job is still running on this conversation"],
  [
    "contentPolicyViolation",
    "a content filter rejected the prompt before it reached the model",
  ],
  [
    "provider_content_policy",
    "the provider's safety filter rejected the prompt; it is strict about recognisable faces, public figures, copyrighted characters and violence, and the attempt may still have counted against the video quota",
  ],
  [
    "quotaExceeded",
    "the account has used its video generations for this period; GET /v1/usage shows what is left",
  ],
]);

export const explainVideoError = (code: string): string => {
  const hint = ERROR_HINTS.get(code);
  return hint ? `${code} — ${hint}` : code;
};

export const submitVideo = (
  cookie: string,
  body: VideoBody,
  signal: AbortSignal | undefined
): Promise<Response> =>
  fetch(`${config.origin}${VIDEO_PATH}`, {
    body: JSON.stringify(body),
    headers: conversationJsonHeaders(cookie, body.conversationId),
    method: "POST",
    redirect: "manual",
    signal,
  });

export const pollVideo = (
  cookie: string,
  conversationId: string,
  jobId: string,
  signal: AbortSignal | undefined
): Promise<Response> =>
  fetch(
    `${config.origin}${VIDEO_PATH}?conversationId=${encodeURIComponent(conversationId)}&jobId=${encodeURIComponent(jobId)}`,
    {
      headers: browserGetHeaders(
        cookie,
        `${config.origin}/chat/${conversationId}`
      ),
      redirect: "manual",
      signal,
    }
  );

/** Best effort: a job nobody is waiting for still spends the video quota. */
export const cancelVideo = async (
  cookie: string,
  conversationId: string,
  jobId: string
): Promise<void> => {
  try {
    const response = await fetch(`${config.origin}${VIDEO_PATH}`, {
      body: JSON.stringify({ _action: "cancel", conversationId, jobId }),
      headers: conversationJsonHeaders(cookie, conversationId),
      method: "POST",
      redirect: "manual",
    });
    await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  } catch {
    // Nothing useful to do; the caller is already on an error path.
  }
};
