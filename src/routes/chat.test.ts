import { afterEach, beforeEach, expect, test } from "bun:test";

import { z } from "zod";

import { app } from "../app";
import { config } from "../lib/config";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const DELETE_PATH = "/actions/update-conversation.data";
const SEND_PREFIX = "/actions/send-message/";
const DELETE_TIMEOUT_MS = 1000;
const FRAME_GAP_MS = 1;

const realFetch = globalThis.fetch;

let calls: string[] = [];
let deletion: PromiseWithResolvers<true>;

const sseBody = (
  frames: readonly string[],
  hold: boolean
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const frame = frames[index];
      if (frame === undefined) {
        controller.close();
        return;
      }
      if (hold) {
        await Bun.sleep(FRAME_GAP_MS);
      }
      controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      index += 1;
    },
  });
};

const deltas = (count: number): string[] =>
  Array.from(
    { length: count },
    (_, index) => `{"type":"text-delta","delta":"chunk${index}"}`
  );

const pathOf = (input: string | URL | Request): string => {
  const url = input instanceof Request ? input.url : String(input);
  return url.replace(config.origin, "");
};

const installFetch = (respond: () => Response): void => {
  const handler = (input: string | URL | Request): Promise<Response> => {
    const path = pathOf(input);
    calls.push(path);
    if (path === DELETE_PATH) {
      deletion.resolve(true);
    }
    if (path.startsWith(SEND_PREFIX)) {
      return Promise.resolve(respond());
    }
    if (path.startsWith("/loaders/")) {
      return Promise.resolve(new Response("{}", { status: 404 }));
    }
    return Promise.resolve(new Response("", { status: 200 }));
  };
  globalThis.fetch = Object.assign(handler, {
    preconnect: realFetch.preconnect,
  });
};

const streamOf = (count: number, hold: boolean) => (): Response =>
  new Response(sseBody(deltas(count), hold), {
    headers: { "content-type": "text/event-stream" },
  });

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

const deleted = (): Promise<boolean> =>
  Promise.race([
    deletion.promise,
    Bun.sleep(DELETE_TIMEOUT_MS).then(() => false),
  ]);

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

beforeEach(() => {
  calls = [];
  deletion = Promise.withResolvers<true>();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("rejects a request without the session cookie", async () => {
  installFetch(streamOf(1, false));
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
  installFetch(streamOf(2, false));
  const response = await app.fetch(chatRequest(true));
  const text = await response.text();
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(text).toContain('"content":"chunk0"');
  expect(text).toContain('"content":"chunk1"');
  expect(text).toContain("data: [DONE]");
  expect(await deleted()).toBe(true);
});

test("deletes the conversation when the client cancels mid-stream", async () => {
  installFetch(streamOf(30, true));
  const response = await app.fetch(chatRequest(true));
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  await reader?.read();
  await reader?.cancel();
  expect(await deleted()).toBe(true);
});

test("deletes the conversation after a buffered completion", async () => {
  installFetch(streamOf(2, false));
  const response = await app.fetch(chatRequest(false));
  const body = completionSchema.parse(await response.json());
  expect(body.choices[0]?.message.content).toBe("chunk0chunk1");
  expect(calls).toContain(DELETE_PATH);
});

test("returns 502 and deletes the conversation when upstream is not a stream", async () => {
  installFetch(
    () =>
      new Response("<html>sign in</html>", {
        headers: { "content-type": "text/html", location: "/auth/sign-in" },
        status: 302,
      })
  );
  const response = await app.fetch(chatRequest(true));
  expect(response.status).toBe(502);
  expect(calls).toContain(DELETE_PATH);
});
