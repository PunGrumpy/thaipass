import { createHmac } from "node:crypto";

import type { StreamEvent } from "@thaipass/core/aipass/stream";
import { z } from "zod";

import { CONFIG_ID, WORKSPACE_ORIGIN } from "./sso";
import type { WorkspaceSession } from "./sso";

const ASSIST_ORIGIN = "https://content-us-discoveryengine.googleapis.com";
const ASSIST_URL = `${ASSIST_ORIGIN}/v1alpha/locations/us/widgetStreamAssist`;
const JWT_LIFETIME_SECONDS = 300;
const DETAIL_LIMIT = 200;
const XSSI_PREFIX = /^\)\]\}'\n/u;
/** The workspace serves its own page to a browser, so it is asked as one. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";

/** The workspace refused the session, so a fresh sign-in may get through. */
export class WorkspaceAuthError extends Error {
  readonly status: number;

  constructor(status: number, step: string) {
    super(`${step} refused the workspace session (${status})`);
    this.name = "WorkspaceAuthError";
    this.status = status;
  }
}

const oxsrfSchema = z.object({ keyId: z.string(), xsrfToken: z.string() });

export type Oxsrf = z.infer<typeof oxsrfSchema>;

type JwtPart = Readonly<Record<string, string | number>>;

const base64Json = (value: JwtPart): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** The bearer the page signs for itself, keyed by the xsrf token the workspace hands out. */
export const signAssistJwt = (
  oxsrf: Oxsrf,
  csesidx: string,
  nowSeconds: number
): string => {
  const signing = `${base64Json({ alg: "HS256", kid: oxsrf.keyId, typ: "JWT" })}.${base64Json(
    {
      aud: ASSIST_ORIGIN,
      exp: nowSeconds + JWT_LIFETIME_SECONDS,
      iat: nowSeconds,
      iss: WORKSPACE_ORIGIN,
      nbf: nowSeconds,
      sub: `csesidx/${csesidx}`,
    }
  )}`;
  const signature = createHmac(
    "sha256",
    Buffer.from(oxsrf.xsrfToken, "base64url")
  )
    .update(signing)
    .digest("base64url");
  return `${signing}.${signature}`;
};

const failed = async (response: Response, step: string): Promise<never> => {
  if (response.status === 401 || response.status === 403) {
    throw new WorkspaceAuthError(response.status, step);
  }
  const detail = await response.text().catch(() => "");
  throw new Error(
    `${step} answered ${response.status}: ${detail.slice(0, DETAIL_LIMIT)}`
  );
};

export const fetchOxsrf = async (
  session: WorkspaceSession,
  signal: AbortSignal | undefined
): Promise<Oxsrf> => {
  const response = await fetch(
    `${WORKSPACE_ORIGIN}/auth/getoxsrf?csesidx=${encodeURIComponent(session.csesidx)}`,
    { headers: { cookie: session.cookie, "user-agent": USER_AGENT }, signal }
  );
  if (!response.ok) {
    return await failed(response, "getoxsrf");
  }
  const text = await response.text();
  return oxsrfSchema.parse(JSON.parse(text.replace(XSSI_PREFIX, "")));
};

/**
 * Yields each top-level `{...}` of a JSON array as its text, as the bytes
 * arrive. Only braces and the string state around them matter: arrays inside
 * an object balance on their own, and the array that wraps them is skipped.
 */
export const objectScanner = (): ((text: string) => string[]) => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let pending = "";
  return (text) => {
    const found: string[] = [];
    let from = 0;
    for (let at = 0; at < text.length; at += 1) {
      const char = text[at];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else if (char === '"') {
        inString = depth > 0;
      } else if (char === "{") {
        if (depth === 0) {
          from = at;
          pending = "";
        }
        depth += 1;
      } else if (char === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0) {
          found.push(pending + text.slice(from, at + 1));
          pending = "";
        }
      }
    }
    if (depth > 0) {
      pending += text.slice(from);
    }
    return found;
  };
};

const objectsOf = async function* objectsOf(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const scan = objectScanner();
  const reader = body.getReader();
  try {
    for (;;) {
      // Each chunk is scanned before the next is asked for.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield* scan(decoder.decode(value, { stream: true }));
    }
    yield* scan(decoder.decode());
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The body is already closed, which is what cancelling wanted.
    }
  }
};

const contentSchema = z.object({
  text: z.string().optional(),
  thought: z.boolean().optional(),
});

const itemSchema = z.object({
  error: z.object({ message: z.string().optional() }).optional(),
  streamAssistResponse: z
    .object({
      answer: z
        .object({
          replies: z
            .array(
              z.object({
                groundedContent: z
                  .object({ content: contentSchema.optional() })
                  .optional(),
              })
            )
            .optional(),
          state: z.string().optional(),
        })
        .optional(),
      modelInfo: z.object({ model: z.string().optional() }).optional(),
    })
    .optional(),
});

interface Announced {
  model?: string;
}

/** One item of the streamed array, as the events it carries. */
export const eventsOf = (raw: string, seen: Announced): StreamEvent[] => {
  const parsed = itemSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return [];
  }
  const { error, streamAssistResponse: item } = parsed.data;
  if (error) {
    return [{ kind: "error", message: error.message ?? "workspace error" }];
  }
  const events: StreamEvent[] = [];
  for (const reply of item?.answer?.replies ?? []) {
    const content = reply.groundedContent?.content;
    // Suggestion chips arrive as inlineData with no text, and drop out here.
    if (content?.text) {
      events.push({
        kind: content.thought ? "reasoning" : "delta",
        text: content.text,
      });
    }
  }
  const model = item?.modelInfo?.model;
  if (model && model !== seen.model) {
    seen.model = model;
    events.push({ kind: "model", model });
  }
  const state = item?.answer?.state;
  if (state === "SUCCEEDED") {
    events.push({ kind: "finish", reason: "stop" });
  } else if (state === "FAILED") {
    events.push({ kind: "error", message: "the workspace failed the answer" });
  }
  return events;
};

const eventsFrom = async function* eventsFrom(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const seen: Announced = {};
  for await (const raw of objectsOf(body)) {
    yield* eventsOf(raw, seen);
  }
};

export interface AssistRequest {
  readonly model: string;
  readonly prompt: string;
  readonly session: WorkspaceSession;
  readonly signal: AbortSignal | undefined;
}

/**
 * Asks the workspace and returns once it has answered 2xx, so a refused
 * session is an error here rather than a stream that fails on its first read.
 */
export const streamAssist = async (
  request: AssistRequest
): Promise<AsyncIterable<StreamEvent>> => {
  const { model, prompt, session, signal } = request;
  const oxsrf = await fetchOxsrf(session, signal);
  const bearer = signAssistJwt(
    oxsrf,
    session.csesidx,
    Math.floor(Date.now() / 1000)
  );
  const response = await fetch(ASSIST_URL, {
    body: JSON.stringify({
      additionalParams: { token: "-" },
      configId: CONFIG_ID,
      streamAssistRequest: {
        assistGenerationConfig: { modelId: model },
        query: { parts: [{ text: prompt }] },
      },
    }),
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      origin: WORKSPACE_ORIGIN,
      referer: `${WORKSPACE_ORIGIN}/`,
      "user-agent": USER_AGENT,
    },
    method: "POST",
    signal,
  });
  if (!(response.ok && response.body)) {
    return await failed(response, "widgetStreamAssist");
  }
  return eventsFrom(response.body);
};
