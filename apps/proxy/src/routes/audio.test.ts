import { afterEach, expect, test } from "bun:test";

import {
  DELETE_PATH,
  sseResponse,
  stubUpstream,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import { app } from "../app";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const CLIP_PATH = "/files/clip.mp3";

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

const audioRequest = (model: string, format?: string): Request =>
  new Request("https://proxy.test/v1/audio/generations", {
    body: JSON.stringify({
      model,
      prompt: "a lullaby",
      response_format: format,
    }),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

const servesClip = (path: string): Response | undefined =>
  path === CLIP_PATH
    ? new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        headers: { "content-type": "audio/mpeg" },
      })
    : undefined;

const fileFrame = `{"type":"file","mediaType":"audio/mpeg","filename":"clip.mp3","url":"${CLIP_PATH}"}`;

const audioSchema = z.object({
  data: z.array(
    z.object({
      b64_json: z.string().optional(),
      media_type: z.string(),
      url: z.string().optional(),
    })
  ),
});

test("answers with the clip and cleans up the conversation", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesClip);
  const response = await app.fetch(audioRequest("lyria-3-clip-preview"));
  expect(response.status).toBe(200);
  const body = audioSchema.parse(await response.json());
  expect(body.data[0]?.media_type).toBe("audio/mpeg");
  expect(body.data[0]?.b64_json).toBe("AQID");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("refuses a video model, which does not come this way", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesClip);
  const response = await app.fetch(audioRequest("seedance-2.0-mini"));
  expect(response.status).toBe(400);
});
