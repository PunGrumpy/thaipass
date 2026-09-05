import { z } from "zod";

import { config } from "../lib/config";
import type { VideoModel } from "./models";
import { browserGetHeaders, conversationJsonHeaders } from "./request";

const VIDEO_PATH = "/actions/video-generation";

export const POLL_INTERVAL_MS = 2000;

/** Matched the way the web client does. */
const PROVIDERS: readonly (readonly [string, RegExp])[] = [
  ["seedance", /^seedance/iu],
  ["veo", /^veo/iu],
  ["sora", /^sora/iu],
  ["wan", /^wan/iu],
];

export const providerFor = (modelId: string): string | undefined =>
  PROVIDERS.find(([, pattern]) => pattern.test(modelId))?.[0];

/** The only option the web UI gates by model. */
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
 * Only what the caller set and this model takes: the upstream rejects the
 * whole body without naming the field it disliked.
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

/** The web UI expands these codes in Thai; a JSON caller gets the hint here. */
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

/** Best effort: a job nobody waits for still spends the video quota. */
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
