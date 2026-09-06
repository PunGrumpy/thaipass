import { afterEach, expect, test } from "bun:test";

import {
  DELETE_PATH,
  quotaResponse,
  sseResponse,
  stubUpstream,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import { app } from "../app";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const IMAGE_PATH = "/files/cat.png";

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

/** The request fields these tests vary, as a caller would send them. */
interface ImageBody {
  aspect_ratio?: string;
  model?: string;
  n?: number;
  prompt?: string;
  response_format?: string;
  size?: string;
}

const imageRequest = (body: ImageBody): Request =>
  new Request("https://proxy.test/v1/images/generations", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

const servesImage = (path: string): Response | undefined =>
  path === IMAGE_PATH
    ? new Response(new Blob([new Uint8Array([137, 80, 78, 71])]), {
        headers: { "content-type": "image/png" },
      })
    : undefined;

const fileFrame = `{"type":"file","mediaType":"image/png","filename":"cat.png","url":"${IMAGE_PATH}"}`;

const imageSchema = z.object({
  created: z.number(),
  data: z.array(
    z.object({
      b64_json: z.string().optional(),
      revised_prompt: z.string().optional(),
      url: z.string().optional(),
    })
  ),
  usage: z
    .object({ credits: z.object({ spent: z.number().optional() }).optional() })
    .optional(),
});

const errorSchema = z.object({ error: z.object({ message: z.string() }) });

test("answers with the image as base64 and cleans up the conversation", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesImage);
  const response = await app.fetch(
    imageRequest({ model: "gpt-image-2", prompt: "a cat" })
  );
  expect(response.status).toBe(200);
  const body = imageSchema.parse(await response.json());
  expect(body.data[0]?.b64_json).toBe("iVBORw==");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("answers with a data uri when the caller asked for a url", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesImage);
  const response = await app.fetch(
    imageRequest({
      model: "gpt-image-2",
      prompt: "a cat",
      response_format: "url",
    })
  );
  const body = imageSchema.parse(await response.json());
  expect(body.data[0]?.url).toStartWith("data:image/png;base64,");
});

const sentSchema = z.object({ imageAspectRatio: z.string().optional() });
const SEND = "/actions/send-message/";

test("reduces a pixel size to the nearest ratio AI Pass offers", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesImage);
  await app.fetch(
    imageRequest({ model: "gpt-image-2", prompt: "a cat", size: "1024x768" })
  );
  expect(upstream.bodyOf(SEND, sentSchema).imageAspectRatio).toBe("4:3");
});

test("takes an aspect ratio outright over a size", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesImage);
  await app.fetch(
    imageRequest({
      aspect_ratio: "3:4",
      model: "gpt-image-2",
      prompt: "a cat",
      size: "1024x1024",
    })
  );
  expect(upstream.bodyOf(SEND, sentSchema).imageAspectRatio).toBe("3:4");
});

test("reports the credits the image spent", async () => {
  // The quota responder holds a read counter, so it is built once, not per call.
  const quota = quotaResponse([100, 130.25], 10_000);
  upstream = stubUpstream(
    sseResponse([fileFrame]),
    (path) => servesImage(path) ?? quota(path)
  );
  const response = await app.fetch(
    imageRequest({ model: "gpt-image-2", prompt: "a cat" })
  );
  const body = imageSchema.parse(await response.json());
  expect(body.usage?.credits?.spent).toBeCloseTo(30.25);
});

test("refuses a chat model, since it answers with no file", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesImage);
  const response = await app.fetch(
    imageRequest({ model: "gemini-3.1-flash-lite", prompt: "a cat" })
  );
  expect(response.status).toBe(400);
});

test("says one image per request rather than silently making one", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesImage);
  const response = await app.fetch(
    imageRequest({ model: "gpt-image-2", n: 3, prompt: "a cat" })
  );
  expect(response.status).toBe(400);
  const body = errorSchema.parse(await response.json());
  expect(body.error.message).toContain("one image per request");
});

test("says so when the model answered with words instead of a file", async () => {
  upstream = stubUpstream(
    sseResponse(['{"type":"text-delta","delta":"I cannot draw that"}']),
    servesImage
  );
  const response = await app.fetch(
    imageRequest({ model: "gpt-image-2", prompt: "a cat" })
  );
  expect(response.status).toBe(400);
  const body = errorSchema.parse(await response.json());
  expect(body.error.message).toContain("I cannot draw that");
});

test("needs a cookie", async () => {
  upstream = stubUpstream(sseResponse([fileFrame]), servesImage);
  const response = await app.fetch(
    new Request("https://proxy.test/v1/images/generations", {
      body: JSON.stringify({ model: "gpt-image-2", prompt: "a cat" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );
  expect(response.status).toBe(401);
});
