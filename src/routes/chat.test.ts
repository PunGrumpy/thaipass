import { afterEach, expect, test } from "bun:test";

import { z } from "zod";

import { app } from "../app";
import {
  DELETE_PATH,
  sseResponse,
  stubUpstream,
  textDeltas,
} from "../testing/upstream";
import type { Upstream } from "../testing/upstream";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const FRAME_GAP_MS = 1;

let upstream: Upstream;

const chatRequest = (stream: boolean): Request =>
  new Request("https://proxy.test/v1/chat/completions", {
    body: JSON.stringify({
      messages: [{ content: "hi", role: "user" }],
      stream,
    }),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

afterEach(() => {
  upstream.restore();
});

test("rejects a request without the session cookie", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(1)));
  const response = await app.fetch(
    new Request("https://proxy.test/v1/chat/completions", {
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );
  expect(response.status).toBe(401);
});

test("streams the upstream deltas as openai chunks", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(chatRequest(true));
  const text = await response.text();
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(text).toContain('"content":"chunk0"');
  expect(text).toContain('"content":"chunk1"');
  expect(text).toContain("data: [DONE]");
  expect(await upstream.deleted()).toBe(true);
});

test("deletes the conversation when the client cancels mid-stream", async () => {
  upstream = stubUpstream(
    sseResponse(textDeltas(30), { pauseMs: FRAME_GAP_MS })
  );
  const response = await app.fetch(chatRequest(true));
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  await reader?.read();
  await reader?.cancel();
  expect(await upstream.deleted()).toBe(true);
});

test("deletes the conversation after a buffered completion", async () => {
  upstream = stubUpstream(sseResponse(textDeltas(2)));
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  expect(body.choices[0]?.message.content).toBe("chunk0chunk1");
  expect(upstream.calls).toContain(DELETE_PATH);
});

test("returns 502 and deletes the conversation when upstream is not a stream", async () => {
  upstream = stubUpstream(
    () =>
      new Response("<html>sign in</html>", {
        headers: { "content-type": "text/html", location: "/auth/sign-in" },
        status: 302,
      })
  );
  const response = await app.fetch(chatRequest(true));
  expect(response.status).toBe(502);
  expect(upstream.calls).toContain(DELETE_PATH);
});
