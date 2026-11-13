import { afterEach, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import type { StreamEvent } from "@thaipass/core/aipass/stream";
import { sseResponse, stubUpstream } from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import { signAssistJwt, streamAssist, WorkspaceAuthError } from "./assist";
import {
  ARGON_TEXT,
  argonReply,
  ASSIST_URL,
  KEY_ID,
  workspaceStub,
  XSRF_KEY,
} from "./testing";

const SESSION = { cookie: "NID=1; __Secure-C_SES=2", csesidx: "42" };
const OXSRF = { keyId: KEY_ID, xsrfToken: XSRF_KEY };
const NOW = 1_800_000_000;

let upstream: Upstream;

afterEach(() => {
  upstream?.restore();
});

const jwtPartSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const fromBase64Url = (part: string) =>
  jwtPartSchema.parse(
    JSON.parse(Buffer.from(part, "base64url").toString("utf-8"))
  );

const collect = async (
  events: AsyncIterable<StreamEvent>
): Promise<StreamEvent[]> => {
  const all: StreamEvent[] = [];
  for await (const event of events) {
    all.push(event);
  }
  return all;
};

const ask = async (reply: string, pieceSize?: number) => {
  const stub = workspaceStub({ pieceSize, reply });
  upstream = stubUpstream(sseResponse([]), stub.respond);
  return await streamAssist({
    model: "gemini-4-argon",
    prompt: "What is 17 times 23?",
    session: SESSION,
    signal: undefined,
  });
};

test("signs a JWT the workspace can check with the xsrf token", () => {
  const jwt = signAssistJwt(OXSRF, "42", NOW);
  const [header = "", claims = "", signature = ""] = jwt.split(".");
  expect(fromBase64Url(header)).toEqual({
    alg: "HS256",
    kid: KEY_ID,
    typ: "JWT",
  });
  expect(fromBase64Url(claims)).toEqual({
    aud: "https://content-us-discoveryengine.googleapis.com",
    exp: NOW + 300,
    iat: NOW,
    iss: "https://vertexaisearch.cloud.google",
    nbf: NOW,
    sub: "csesidx/42",
  });
  const expected = createHmac("sha256", Buffer.from(XSRF_KEY, "base64url"))
    .update(`${header}.${claims}`)
    .digest("base64url");
  expect(signature).toBe(expected);
});

test("reads the fixture however the bytes are cut", async () => {
  const reply = await argonReply();
  for (const size of [1, 2, 3, 7, 13, 64, 1000, reply.length]) {
    // Each size is its own read of the same body, in turn.
    // oxlint-disable-next-line no-await-in-loop
    const events = await collect(await ask(reply, size));
    upstream.restore();
    expect(events).toEqual([
      { kind: "delta", text: ARGON_TEXT[0] ?? "" },
      { kind: "delta", text: ARGON_TEXT[1] ?? "" },
      { kind: "model", model: "gemini-4-argon" },
      { kind: "finish", reason: "stop" },
    ]);
  }
});

test("keeps braces, quotes, escapes and multi-byte text inside a string whole", async () => {
  const text = 'a "quote" } { \\ \n ไทย 😀';
  const talking = {
    streamAssistResponse: {
      answer: { replies: [{ groundedContent: { content: { text } } }] },
    },
  };
  const done = { streamAssistResponse: { answer: { state: "SUCCEEDED" } } };
  const reply = `[\n${JSON.stringify(talking)}\n,\n${JSON.stringify(done)}\n]`;
  const events = await collect(await ask(reply, 1));
  expect(events).toEqual([
    { kind: "delta", text },
    { kind: "finish", reason: "stop" },
  ]);
});

test("reads a thought part as reasoning", async () => {
  const reply = JSON.stringify([
    {
      streamAssistResponse: {
        answer: {
          replies: [
            { groundedContent: { content: { text: "hmm", thought: true } } },
            { groundedContent: { content: { text: "hi" } } },
          ],
        },
      },
    },
  ]);
  expect(await collect(await ask(reply))).toEqual([
    { kind: "reasoning", text: "hmm" },
    { kind: "delta", text: "hi" },
  ]);
});

test("asks for the model and the prompt it was given", async () => {
  await collect(await ask(await argonReply()));
  const body = upstream.bodyOf(
    ASSIST_URL,
    z.object({
      streamAssistRequest: z.object({
        assistGenerationConfig: z.object({ modelId: z.string() }),
        query: z.object({ parts: z.array(z.object({ text: z.string() })) }),
      }),
    })
  );
  expect(body.streamAssistRequest.assistGenerationConfig.modelId).toBe(
    "gemini-4-argon"
  );
  expect(body.streamAssistRequest.query.parts[0]?.text).toBe(
    "What is 17 times 23?"
  );
});

test("calls a refused session an auth error, whichever endpoint refused it", async () => {
  const oxsrf = workspaceStub({ oxsrf: [401], reply: "[]" });
  upstream = stubUpstream(sseResponse([]), oxsrf.respond);
  await expect(
    streamAssist({
      model: "m",
      prompt: "p",
      session: SESSION,
      signal: undefined,
    })
  ).rejects.toBeInstanceOf(WorkspaceAuthError);
  upstream.restore();

  const assist = workspaceStub({ assist: [403], reply: "[]" });
  upstream = stubUpstream(sseResponse([]), assist.respond);
  await expect(
    streamAssist({
      model: "m",
      prompt: "p",
      session: SESSION,
      signal: undefined,
    })
  ).rejects.toBeInstanceOf(WorkspaceAuthError);
});

test("names the status of any other failure", async () => {
  const stub = workspaceStub({ assist: [400], reply: "[]" });
  upstream = stubUpstream(sseResponse([]), stub.respond);
  let failure: Error | undefined;
  try {
    await streamAssist({
      model: "nope",
      prompt: "p",
      session: SESSION,
      signal: undefined,
    });
  } catch (error) {
    failure = error instanceof Error ? error : undefined;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(WorkspaceAuthError);
  expect(failure?.message).toContain("400");
});
