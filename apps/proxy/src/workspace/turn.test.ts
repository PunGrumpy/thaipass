import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  SEND_PREFIX,
  sseResponse,
  stubUpstream,
} from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import { app } from "../app";
import { clearSessions, stubSignIn } from "./sessions";
import { ARGON_TEXT, argonReply, workspaceStub } from "./testing";
import type { WorkspaceStubOptions } from "./testing";

const COOKIE = "__Secure-ai_passport_auth.session_token=ws.token";
const MODEL = "gemini-4-argon";
const FULL_TEXT = ARGON_TEXT.join("");
const PNG_DATA_URI = "data:image/png;base64,aGk=";

let upstream: Upstream;
let restoreSignIn: () => void;

const errorSchema = z.object({ error: z.object({ message: z.string() }) });
const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});
const chunkSchema = z.object({
  choices: z.array(
    z.object({ delta: z.object({ content: z.string().optional() }) })
  ),
});
const messageSchema = z.object({
  content: z.array(z.object({ text: z.string(), type: z.literal("text") })),
});

const serve = async (options: Partial<WorkspaceStubOptions> = {}) => {
  const stub = workspaceStub({ reply: await argonReply(), ...options });
  upstream = stubUpstream(sseResponse([]), stub.respond);
  return stub;
};

const BROWSER = { "x-browser-token": "browserkey" };

interface ContentPart {
  readonly image_url?: { readonly url: string };
  readonly text?: string;
  readonly type: string;
}

const chat = (
  stream: boolean,
  headers: Record<string, string> = BROWSER,
  content: string | readonly ContentPart[] = "hi"
): Request =>
  new Request("https://proxy.test/v1/chat/completions", {
    body: JSON.stringify({
      messages: [{ content, role: "user" }],
      model: MODEL,
      stream,
    }),
    headers: {
      authorization: `Bearer ${COOKIE}`,
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });

beforeEach(() => {
  clearSessions();
  restoreSignIn = stubSignIn(() =>
    Promise.resolve({ cookie: "NID=1", csesidx: "7" })
  );
});

afterEach(() => {
  restoreSignIn();
  upstream.restore();
});

test("asks for a browser key when a workspace model arrives without one", async () => {
  await serve();
  const response = await app.fetch(chat(false, {}));
  expect(response.status).toBe(400);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "x-browser-token"
  );
});

test("answers a buffered chat completion from the workspace", async () => {
  await serve();
  const response = await app.fetch(chat(false));
  expect(response.status).toBe(200);
  const body = completionSchema.parse(await response.json());
  expect(body.choices[0]?.message.content).toBe(FULL_TEXT);
  expect(upstream.calls.some((path) => path.startsWith(SEND_PREFIX))).toBe(
    false
  );
});

test("streams a chat completion from the workspace", async () => {
  await serve();
  const response = await app.fetch(chat(true));
  const text = await response.text();
  const streamed = text
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => chunkSchema.parse(JSON.parse(line.slice(6))))
    .map((chunk) => chunk.choices[0]?.delta.content ?? "")
    .join("");
  expect(streamed).toBe(FULL_TEXT);
  expect(text).toContain("data: [DONE]");
});

test("answers /v1/messages from the workspace", async () => {
  await serve();
  const response = await app.fetch(
    new Request("https://proxy.test/v1/messages", {
      body: JSON.stringify({
        max_tokens: 256,
        messages: [{ content: "hi", role: "user" }],
        model: MODEL,
      }),
      headers: {
        "content-type": "application/json",
        "x-api-key": COOKIE,
        "x-browser-token": "browserkey",
      },
      method: "POST",
    })
  );
  expect(response.status).toBe(200);
  expect(messageSchema.parse(await response.json()).content[0]?.text).toBe(
    FULL_TEXT
  );
});

test("refuses an attachment, since the workspace takes text only", async () => {
  await serve();
  const response = await app.fetch(
    chat(false, BROWSER, [
      { text: "what is this", type: "text" },
      { image_url: { url: PNG_DATA_URI }, type: "image_url" },
    ])
  );
  expect(response.status).toBe(400);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "attachments"
  );
});

test("says the account may lack the entitlement when the workspace refuses it", async () => {
  await serve({ oxsrf: [401] });
  const response = await app.fetch(chat(false));
  expect(response.status).toBe(401);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "Gemini Enterprise"
  );
});

test("answers 502 when the workspace fails another way", async () => {
  await serve({ assist: [500] });
  const response = await app.fetch(chat(false));
  expect(response.status).toBe(502);
});
