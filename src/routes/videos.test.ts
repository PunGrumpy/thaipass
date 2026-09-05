import { afterEach, expect, test } from "bun:test";

import { z } from "zod";

import { app } from "../app";
import { DELETE_PATH, stubUpstream } from "../testing/upstream";
import type { Upstream } from "../testing/upstream";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const VIDEO_PATH = "/actions/video-generation";
const CLIP_PATH = "/files/clip.mp4";

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

interface VideoBody {
  aspect_ratio?: string;
  camera_fixed?: boolean;
  duration?: number;
  generate_audio?: boolean;
  model?: string;
  prompt?: string;
  resolution?: string;
  response_format?: string;
  style_preprompt?: string;
}

const videoRequest = (body: VideoBody): Request =>
  new Request("https://proxy.test/v1/videos", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

/** Submit answers with a job id; the first poll runs, then it completes. */
interface JobState {
  error?: string;
  progress?: number;
  status?: string;
  videoUrl?: string;
}

const videoUpstream = (states: readonly JobState[]) => {
  let polls = 0;
  return (path: string): Response | undefined => {
    if (path === CLIP_PATH) {
      return new Response(new Blob([new Uint8Array([0, 1])]), {
        headers: { "content-type": "video/mp4" },
      });
    }
    if (!path.startsWith(VIDEO_PATH)) {
      return undefined;
    }
    if (path === VIDEO_PATH) {
      return Response.json({ jobId: "job_1" });
    }
    const state = states[Math.min(polls, states.length - 1)] ?? {};
    polls += 1;
    return Response.json(state);
  };
};

const responseSchema = z.object({
  data: z.array(
    z.object({ b64_json: z.string().optional(), url: z.string().optional() })
  ),
  job_id: z.string(),
  model: z.string().optional(),
});

const errorSchema = z.object({ error: z.object({ message: z.string() }) });
const sentSchema = z.object({
  aspectRatio: z.string().optional(),
  cameraFixed: z.boolean().optional(),
  duration: z.number().optional(),
  generateAudio: z.boolean().optional(),
  modelId: z.string(),
  provider: z.string().optional(),
  resolution: z.string().optional(),
});

const completed = { status: "completed", videoUrl: CLIP_PATH };

test("polls the job until it completes, then reads the clip", async () => {
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    videoUpstream([{ progress: 40, status: "running" }, completed])
  );
  const response = await app.fetch(
    videoRequest({ model: "seedance-2.0-mini", prompt: "a street at night" })
  );
  expect(response.status).toBe(200);
  const body = responseSchema.parse(await response.json());
  expect(body.job_id).toBe("job_1");
  expect(body.data[0]?.url).toStartWith("data:video/mp4;base64,");
  expect(upstream.calls).toContain(DELETE_PATH);
}, 20_000);

test("sends only the options this model takes", async () => {
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    videoUpstream([completed])
  );
  await app.fetch(
    videoRequest({
      aspect_ratio: "16:9",
      camera_fixed: true,
      duration: 5,
      model: "seedance-2.0-mini",
      prompt: "a street",
      resolution: "720p",
    })
  );
  const sent = upstream.bodyOf(VIDEO_PATH, sentSchema);
  expect(sent.provider).toBe("seedance");
  expect(sent.resolution).toBe("720p");
  expect(sent.duration).toBe(5);
  expect(sent.cameraFixed).toBe(true);
}, 20_000);

test("drops a resolution the model does not offer rather than failing the body", async () => {
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    videoUpstream([completed])
  );
  await app.fetch(
    videoRequest({
      model: "veo-3.1-fast-generate-001",
      prompt: "a street",
      resolution: "720p",
    })
  );
  const sent = upstream.bodyOf(VIDEO_PATH, sentSchema);
  expect(sent.resolution).toBeUndefined();
  expect(sent.provider).toBe("veo");
}, 20_000);

test("drops seedance-only options for a model that does not take them", async () => {
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    videoUpstream([completed])
  );
  await app.fetch(
    videoRequest({
      duration: 8,
      generate_audio: true,
      model: "veo-3.1-fast-generate-001",
      prompt: "a street",
    })
  );
  const sent = upstream.bodyOf(VIDEO_PATH, sentSchema);
  expect(sent.duration).toBeUndefined();
  expect(sent.generateAudio).toBeUndefined();
}, 20_000);

test("expands a terse failure code into something actionable", async () => {
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    videoUpstream([{ error: "quotaExceeded", status: "failed" }])
  );
  const response = await app.fetch(
    videoRequest({ model: "seedance-2.0-mini", prompt: "a street" })
  );
  expect(response.status).toBe(502);
  const body = errorSchema.parse(await response.json());
  expect(body.error.message).toContain("quotaExceeded");
  expect(body.error.message).toContain("video generations for this period");
}, 20_000);

test("cancels the job upstream when it fails, so it stops spending quota", async () => {
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    videoUpstream([{ error: "provider_content_policy", status: "failed" }])
  );
  await app.fetch(
    videoRequest({ model: "seedance-2.0-mini", prompt: "a street" })
  );
  const cancels = upstream.sent.filter(
    (call) => call.path === VIDEO_PATH && call.body.includes("cancel")
  );
  expect(cancels).toHaveLength(1);
}, 20_000);

test("says which model actually ran when AI Pass switched it", async () => {
  upstream = stubUpstream(
    () => new Response("", { status: 200 }),
    (path) => {
      if (path === VIDEO_PATH) {
        return Response.json({
          autoSwitched: true,
          jobId: "job_1",
          modelId: "seedance-2.0-fast",
        });
      }
      return videoUpstream([completed])(path);
    }
  );
  const response = await app.fetch(
    videoRequest({ model: "seedance-2.0-mini", prompt: "a street" })
  );
  const body = responseSchema.parse(await response.json());
  expect(body.model).toBe("seedance-2.0-fast");
}, 20_000);

test("refuses an image model on the video endpoint", async () => {
  upstream = stubUpstream(() => new Response("", { status: 200 }));
  const response = await app.fetch(
    videoRequest({ model: "gpt-image-2", prompt: "a street" })
  );
  expect(response.status).toBe(400);
});
