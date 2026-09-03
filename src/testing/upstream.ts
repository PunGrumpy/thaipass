import { config } from "../lib/config";
import { sseStream } from "./sse";
import type { SseStreamOptions } from "./sse";

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

export interface Upstream {
  readonly calls: string[];
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
  const deletion = Promise.withResolvers<true>();
  const handler = (input: string | URL | Request): Promise<Response> => {
    const path = pathOf(input);
    calls.push(path);
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
    calls,
    deleted: () => Promise.race([deletion.promise, timeout()]),
    restore: () => {
      globalThis.fetch = realFetch;
    },
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
