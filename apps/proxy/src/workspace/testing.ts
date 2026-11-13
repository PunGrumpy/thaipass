/** Stands in for the workspace's two endpoints, so no test reaches Google. */

export const OXSRF_URL = "https://vertexaisearch.cloud.google/auth/getoxsrf";
export const ASSIST_URL =
  "https://content-us-discoveryengine.googleapis.com/v1alpha/locations/us/widgetStreamAssist";

export const XSRF_KEY = Buffer.from("a-test-signing-key").toString("base64url");
export const KEY_ID = "key-1";

/** A real reply from gemini-4-argon, with its tokens scrubbed. */
export const argonReply = (): Promise<string> =>
  Bun.file(new URL("fixtures/argon-reply.json", import.meta.url)).text();

export const ARGON_TEXT = [
  "The product of 17 multiplied by 23 is **391**.",
  "\n\nWould you like to solve another calculation or explore a quick mental math trick for multiplying two-digit numbers?\n\n",
];

/** The body in pieces of `size` bytes, so a test can cut it anywhere. */
export const inPieces = (
  text: string,
  size: number
): ReadableStream<Uint8Array> => {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
};

export interface WorkspaceStubOptions {
  /** The status each getoxsrf call answers with, then 200. */
  readonly oxsrf?: readonly number[];
  /** The status each assist call answers with, then 200. */
  readonly assist?: readonly number[];
  readonly reply: string;
  readonly pieceSize?: number;
}

export interface WorkspaceStub {
  readonly respond: (path: string) => Response | undefined;
  readonly seen: { assist: number; oxsrf: number };
}

const DEFAULT_PIECE = 64;

export const workspaceStub = (options: WorkspaceStubOptions): WorkspaceStub => {
  const seen = { assist: 0, oxsrf: 0 };
  const respond = (path: string): Response | undefined => {
    if (path.startsWith(OXSRF_URL)) {
      const status = options.oxsrf?.[seen.oxsrf] ?? 200;
      seen.oxsrf += 1;
      return status === 200
        ? new Response(
            `)]}'\n${JSON.stringify({ keyId: KEY_ID, xsrfToken: XSRF_KEY })}`
          )
        : new Response("no", { status });
    }
    if (path === ASSIST_URL) {
      const status = options.assist?.[seen.assist] ?? 200;
      seen.assist += 1;
      return status === 200
        ? new Response(
            inPieces(options.reply, options.pieceSize ?? DEFAULT_PIECE)
          )
        : new Response("no", { status });
    }
    return undefined;
  };
  return { respond, seen };
};
