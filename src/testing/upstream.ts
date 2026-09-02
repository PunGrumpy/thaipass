import { config } from "../lib/config";
import { sseStream } from "./sse";
import type { SseStreamOptions } from "./sse";

export const DELETE_PATH = "/actions/update-conversation.data";
export const SEND_PREFIX = "/actions/send-message/";

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

export const stubUpstream = (respond: () => Response): Upstream => {
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
