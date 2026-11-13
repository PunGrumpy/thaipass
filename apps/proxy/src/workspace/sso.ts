import { z } from "zod";

export interface WorkspaceSession {
  /** The Cookie header the workspace's own endpoints take. */
  readonly cookie: string;
  readonly csesidx: string;
}

export const WORKSPACE_ORIGIN = "https://vertexaisearch.cloud.google";
export const CONFIG_ID = "3c0d3b0e-1de2-4577-bcea-16b67f1f289e";

const SESSION_COOKIE = "__Secure-ai_passport_auth.session_token";
const SSO_URL = `https://auth.cloud.google/signin/locations/global/workforcePools/aip-prd-citizens/providers/aipass?continueUrl=${encodeURIComponent(`${WORKSPACE_ORIGIN}/us/home/cid/${CONFIG_ID}`)}`;
const LANDED = /vertexaisearch\.cloud\.google\/.*csesidx=/u;
const LEADING_DOT = /^\./u;
/** Nothing here needs a page to look right, and every byte costs Browserless units. */
const UNNEEDED = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "woff",
  "woff2",
  "ttf",
  "css",
].map((extension) => `*.${extension}*`);
const STEP_TIMEOUT_MS = 30_000;

const cookieSchema = z.object({
  domain: z.string(),
  name: z.string(),
  path: z.string(),
  value: z.string(),
});

export type CdpCookie = z.infer<typeof cookieSchema>;

/** One frame off the socket: a reply carries an id, an event carries a method. */
const messageSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
  id: z.number().optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  sessionId: z.string().optional(),
});

const anyReply = z.unknown();
const contextSchema = z.object({ browserContextId: z.string() });
const targetSchema = z.object({ targetId: z.string() });
const attachedSchema = z.object({ sessionId: z.string() });
const navigatedSchema = z.object({ errorText: z.string().optional() });
const cookiesSchema = z.object({ cookies: z.array(cookieSchema) });
const frameNavigatedSchema = z.object({
  frame: z.object({ parentId: z.string().optional(), url: z.string() }),
});

/** The cookies a browser would send to `url`'s root, as one Cookie header. */
export const cookieHeaderFor = (
  cookies: readonly CdpCookie[],
  url: string
): string => {
  const host = new URL(url).hostname;
  return cookies
    .filter(({ domain, path }) => {
      const bare = domain.replace(LEADING_DOT, "");
      return path === "/" && (host === bare || host.endsWith(`.${bare}`));
    })
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
};

/** A refused connection names the endpoint, and the endpoint carries the caller's key. */
const withoutEndpoint = (cause: unknown, endpoint: string): Error => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const key = new URL(endpoint).searchParams.get("token");
  let clean = message.replaceAll(endpoint, "<browser endpoint>");
  if (key) {
    clean = clean.replaceAll(key, "<key>");
  }
  return new Error(`could not reach the browser: ${clean}`);
};

const timeout = async <T>(work: Promise<T>, what: string): Promise<T> => {
  const expired = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    expired.reject(new Error(`${what} took over ${STEP_TIMEOUT_MS}ms`));
  }, STEP_TIMEOUT_MS);
  try {
    return await Promise.race([work, expired.promise]);
  } finally {
    clearTimeout(timer);
  }
};

type CdpMessage = z.infer<typeof messageSchema>;
type CdpEvent = (message: CdpMessage) => void;
type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };
type CdpParams = Readonly<Record<string, Json>>;

interface Cdp {
  readonly close: () => void;
  readonly on: (method: string, listener: CdpEvent) => void;
  readonly send: <T>(
    schema: z.ZodType<T>,
    method: string,
    params: CdpParams,
    sessionId?: string
  ) => Promise<T>;
}

/**
 * Raw CDP over the runtime's own WebSocket. Playwright's client upgrades
 * through node:http, which hangs on Vercel's Bun runtime, while the built-in
 * WebSocket connects there in under a second.
 */
const openCdp = async (endpoint: string): Promise<Cdp> => {
  const socket = new WebSocket(endpoint);
  const pending = new Map<
    number,
    ReturnType<typeof Promise.withResolvers<unknown>>
  >();
  const listeners = new Map<string, CdpEvent[]>();
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = messageSchema.parse(JSON.parse(String(event.data)));
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        waiter?.reject(new Error(message.error.message));
      } else {
        waiter?.resolve(message.result);
      }
      return;
    }
    for (const listener of listeners.get(message.method ?? "") ?? []) {
      listener(message);
    }
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error("the browser closed the connection"));
    }
    pending.clear();
  });
  const opened = Promise.withResolvers<null>();
  socket.addEventListener("open", () => opened.resolve(null), { once: true });
  socket.addEventListener(
    "error",
    () => opened.reject(new Error("the browser refused the connection")),
    { once: true }
  );
  await timeout(opened.promise, "connecting");
  return {
    close: () => socket.close(),
    on: (method, listener) => {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    },
    send: async (schema, method, params, sessionId) => {
      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error("the browser connection is closed");
      }
      nextId += 1;
      const reply = Promise.withResolvers<unknown>();
      pending.set(nextId, reply);
      socket.send(JSON.stringify({ id: nextId, method, params, sessionId }));
      return schema.parse(await timeout(reply.promise, method));
    },
  };
};

/**
 * The main frame's URL once the redirect chain lands on the workspace. It
 * never rejects, so it can start listening before the navigation that may fail.
 */
const landing = (cdp: Cdp, sessionId: string): Promise<string> => {
  const landed = Promise.withResolvers<string>();
  cdp.on("Page.frameNavigated", (message) => {
    const { frame } = frameNavigatedSchema.parse(message.params);
    if (
      message.sessionId === sessionId &&
      !frame.parentId &&
      LANDED.test(frame.url)
    ) {
      landed.resolve(frame.url);
    }
  });
  return landed.promise;
};

const disposeQuietly = async (cdp: Cdp, browserContextId: string) => {
  try {
    await cdp.send(anyReply, "Target.disposeBrowserContext", {
      browserContextId,
    });
  } catch {
    // The browser is already gone, which is what disposing wanted.
  }
};

/**
 * Google's sign-in script fills its handler form from browser storage, so a
 * plain fetch walk of the redirect chain gets a 400. A real browser, the
 * caller's own over CDP, does the walk once; everything after it is plain HTTP.
 */
export const signIn = async (
  sessionToken: string,
  endpoint: string,
  signal: AbortSignal
): Promise<WorkspaceSession> => {
  let cdp: Cdp;
  try {
    cdp = await openCdp(endpoint);
  } catch (error) {
    throw withoutEndpoint(error, endpoint);
  }
  const abandon = (): void => cdp.close();
  signal.addEventListener("abort", abandon, { once: true });
  let browserContextId: string | undefined;
  try {
    ({ browserContextId } = await cdp.send(
      contextSchema,
      "Target.createBrowserContext",
      {}
    ));
    await cdp.send(anyReply, "Storage.setCookies", {
      browserContextId,
      cookies: [
        {
          domain: ".aipass.net",
          httpOnly: true,
          name: SESSION_COOKIE,
          path: "/",
          sameSite: "Lax",
          secure: true,
          value: sessionToken,
        },
      ],
    });
    const { targetId } = await cdp.send(targetSchema, "Target.createTarget", {
      browserContextId,
      url: "about:blank",
    });
    const { sessionId: page } = await cdp.send(
      attachedSchema,
      "Target.attachToTarget",
      { flatten: true, targetId }
    );
    await cdp.send(anyReply, "Network.enable", {}, page);
    await cdp.send(
      anyReply,
      "Network.setBlockedURLs",
      { urls: UNNEEDED },
      page
    );
    await cdp.send(anyReply, "Page.enable", {}, page);
    const landed = landing(cdp, page);
    const { errorText } = await cdp.send(
      navigatedSchema,
      "Page.navigate",
      { url: SSO_URL },
      page
    );
    if (errorText) {
      throw new Error(`sign-in page failed to load: ${errorText}`);
    }
    const url = await timeout(landed, "sign-in");
    const csesidx = new URL(url).searchParams.get("csesidx");
    if (!csesidx) {
      throw new Error("sign-in landed without a csesidx");
    }
    const { cookies } = await cdp.send(cookiesSchema, "Storage.getCookies", {
      browserContextId,
    });
    return {
      cookie: cookieHeaderFor(cookies, `${WORKSPACE_ORIGIN}/`),
      csesidx,
    };
  } finally {
    signal.removeEventListener("abort", abandon);
    // Browserless ends the session with the socket, but a self-hosted Chrome keeps running, so drop the context first.
    if (browserContextId) {
      await disposeQuietly(cdp, browserContextId);
    }
    cdp.close();
  }
};
