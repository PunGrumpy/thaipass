import type { z } from "zod";

import { config } from "../lib/config";
import { sseStream } from "./sse";
import type { SseStreamOptions } from "./sse";

export const CREATE_PATH = "/chat.data";
export const INITIATE_PATH = "/actions/upload-file/initiate";
export const CONFIRM_PATH = "/actions/upload-file/confirm";
export const DELETE_PATH = "/actions/update-conversation.data";
export const SEND_PREFIX = "/actions/send-message/";
export const QUOTA_PATH = "/loaders/get-usage-quota";
const QUOTA_DECIMALS = 2;
const RESET_AT = "2026-09-04T00:00:00.000Z";

const DELETE_TIMEOUT_MS = 1000;

const timeout = async (): Promise<false> => {
  await Bun.sleep(DELETE_TIMEOUT_MS);
  return false;
};

/** One upstream call, so a test can assert what the proxy actually sent. */
export interface UpstreamCall {
  readonly path: string;
  readonly body: string;
  readonly method: string;
}

export interface Upstream {
  readonly calls: string[];
  readonly sent: UpstreamCall[];
  /** The body of the last call whose path starts with the prefix, read through a schema. */
  readonly bodyOf: <T>(prefix: string, schema: z.ZodType<T>) => T;
  readonly deleted: () => Promise<boolean>;
  readonly restore: () => void;
}

const pathOf = (input: string | URL | Request): string => {
  const url = input instanceof Request ? input.url : String(input);
  return url.replace(config.origin, "");
};

export const stubUpstream = (
  respond: () => Response,
  extra?: (path: string) => Response | undefined
): Upstream => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  const sent: UpstreamCall[] = [];
  const deletion = Promise.withResolvers<true>();
  const handler = (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const path = pathOf(input);
    calls.push(path);
    sent.push({
      body: String(init?.body ?? ""),
      method: init?.method ?? "GET",
      path,
    });
    if (path === DELETE_PATH) {
      deletion.resolve(true);
    }
    if (path.startsWith(SEND_PREFIX)) {
      return Promise.resolve(respond());
    }
    const routed = extra?.(path);
    if (routed) {
      return Promise.resolve(routed);
    }
    if (path.startsWith("/loaders/")) {
      return Promise.resolve(new Response("{}", { status: 404 }));
    }
    return Promise.resolve(new Response("", { status: 200 }));
  };
  globalThis.fetch = Object.assign(handler, {
    preconnect: realFetch.preconnect,
  });
  return {
    bodyOf: <T>(prefix: string, schema: z.ZodType<T>): T => {
      /** A GET to the same prefix carries no body, so only a call that sent one counts. */
      const call = sent.findLast(
        (entry) => entry.path.startsWith(prefix) && entry.body.length > 0
      );
      if (!call) {
        throw new Error(`no upstream call with a body to ${prefix}`);
      }
      return schema.parse(JSON.parse(call.body));
    },
    calls,
    deleted: () => Promise.race([deletion.promise, timeout()]),
    restore: () => {
      globalThis.fetch = realFetch;
    },
    sent,
  };
};

/** Answers the three upload calls, with the signed PUT living off-origin. */
export const uploadResponse = (
  storageKey = "uploads/abc123"
): ((path: string) => Response | undefined) => {
  const uploadUrl = "https://storage.test/signed-put";
  return (path: string): Response | undefined => {
    if (path === INITIATE_PATH) {
      return Response.json({
        sizeBytes: 2,
        storageKey,
        uploadToken: "tok_1",
        uploadUrl,
      });
    }
    if (path === CONFIRM_PATH) {
      return Response.json({ storageKey });
    }
    if (path === uploadUrl) {
      return new Response("", { status: 200 });
    }
    return undefined;
  };
};

export const textDeltas = (count: number): string[] =>
  Array.from(
    { length: count },
    (_, index) => `{"type":"text-delta","delta":"chunk${index}"}`
  );

export const sseResponse =
  (frames: readonly string[], options: SseStreamOptions = {}) =>
  (): Response =>
    new Response(sseStream(frames, options), {
      headers: { "content-type": "text/event-stream" },
    });

/** Answers the quota loader with one `used` figure per read, then the last one. */
export const quotaResponse = (used: readonly number[], limit: number) => {
  let reads = 0;
  const scale = 10 ** QUOTA_DECIMALS;
  return (path: string): Response | undefined => {
    if (path !== QUOTA_PATH) {
      return undefined;
    }
    const current = used[Math.min(reads, used.length - 1)] ?? 0;
    reads += 1;
    return Response.json({
      creditStatus: {
        credits: {
          available: String(Math.round((limit - current) * scale)),
          limit: String(Math.round(limit * scale)),
          used: String(Math.round(current * scale)),
        },
        creditsDecimals: QUOTA_DECIMALS,
        periodEndsAt: RESET_AT,
      },
    });
  };
};
