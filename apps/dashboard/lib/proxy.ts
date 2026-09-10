/**
 * Everything the dashboard knows about the thaipass proxy's HTTP surface.
 * The session cookie never leaves the browser, so every call here runs
 * client-side against whatever origin the user pointed the dashboard at.
 */

export interface ProxyHealth {
  models: number;
  ok: boolean;
  origin: string;
}

export interface CreditBalance {
  available: number;
  limit: number;
  reset_at: string;
  used: number;
}

export type ModelKind = "chat" | "image" | "music" | "video";

export interface VideoOptions {
  aspectRatio: boolean;
  cameraFixed: boolean;
  duration: boolean;
  generateAudio: boolean;
  provider: string | null;
  resolutions: readonly string[] | null;
  stylePreprompt: boolean;
}

export interface CatalogModel {
  free: boolean;
  id: string;
  kind: ModelKind;
  options: VideoOptions | null;
  ready: boolean;
  thinking: readonly string[] | null;
}

export interface ChatMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

const TRAILING_SLASHES = /\/+$/u;
const COOKIE_PREFIX = /^cookie:\s*/iu;
const BEARER_PREFIX = /^(?:authorization:\s*)?bearer\s+/iu;

/** `http://host:3001/` and `http://host:3001` have to build the same URL. */
export const normalizeProxyUrl = (raw: string): string =>
  raw.trim().replace(TRAILING_SLASHES, "");

/**
 * People paste the whole `Cookie:` header out of devtools, or an
 * `Authorization: Bearer …` line out of a config. Both carry the value we want.
 */
export const normalizeCookie = (raw: string): string =>
  raw.trim().replace(COOKIE_PREFIX, "").replace(BEARER_PREFIX, "").trim();

interface ApiErrorBody {
  error?: { message?: string };
}

const readError = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  // SAFETY: every non-2xx from the proxy is `{ error: { message } }`, and the
  // optional chain below covers a body that turns out to be anything else.
  const message = (body as ApiErrorBody | null)?.error?.message;
  return message ?? `HTTP ${response.status}: ${response.statusText}`;
};

const authHeaders = (cookie: string): HeadersInit => ({
  authorization: `Bearer ${cookie}`,
});

/**
 * A cross-origin fetch that never arrives fails as a bare "Failed to fetch",
 * which says nothing a reader can act on. Every reason lands in the same
 * place — the gateway is not running, or it is not allowing this origin — so
 * the message names both.
 */
export const gatewayFetch = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const { origin } = new URL(url);
    throw new Error(
      `Cannot reach the gateway at ${origin}. Check that it is running, and that this page's origin is allowed by AIPASS_CORS_ORIGIN.`,
      { cause: error }
    );
  }
};

export const fetchHealth = async (
  proxyUrl: string,
  signal?: AbortSignal
): Promise<ProxyHealth> => {
  const response = await gatewayFetch(`${normalizeProxyUrl(proxyUrl)}/health`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  // SAFETY: GET /health is declared as the Health schema in the proxy's OpenAPI.
  return (await response.json()) as ProxyHealth;
};

export const fetchCredits = async (
  proxyUrl: string,
  cookie: string,
  signal?: AbortSignal
): Promise<CreditBalance> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/v1/usage`,
    {
      cache: "no-store",
      headers: authHeaders(cookie),
      signal,
    }
  );
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  // SAFETY: GET /v1/usage returns the CreditBalance schema on 200; every other
  // status was rejected above.
  return (await response.json()) as CreditBalance;
};

export const fetchCatalog = async (
  proxyUrl: string,
  cookie: string,
  signal?: AbortSignal
): Promise<CatalogModel[]> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/v1/models`,
    {
      cache: "no-store",
      headers: authHeaders(cookie),
      signal,
    }
  );
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  // SAFETY: GET /v1/models returns the ModelList schema on 200; every other
  // status was rejected above.
  const body = (await response.json()) as { data: CatalogModel[] };
  return body.data;
};

export interface StreamChatParams {
  cookie: string;
  messages: readonly ChatMessage[];
  model: string;
  onDelta: (delta: string) => void;
  onFirstDelta: () => void;
  proxyUrl: string;
  signal: AbortSignal;
}

const DATA_PREFIX = "data:";
const DONE = "[DONE]";

interface ChunkBody {
  choices?: { delta?: { content?: string } }[];
}

const deltaOf = (payload: string): string | undefined => {
  try {
    // SAFETY: an OpenAI-shaped SSE chunk; every field read below is optional,
    // so a keep-alive or a tool-call chunk yields no delta.
    const parsed = JSON.parse(payload) as ChunkBody;
    return parsed.choices?.[0]?.delta?.content;
  } catch {
    return undefined;
  }
};

/** Reads an OpenAI-shaped SSE body and hands each content delta to the caller. */
export const streamChatCompletion = async ({
  cookie,
  messages,
  model,
  onDelta,
  onFirstDelta,
  proxyUrl,
  signal,
}: StreamChatParams): Promise<void> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/v1/chat/completions`,
    {
      body: JSON.stringify({ messages, model, stream: true }),
      headers: { ...authHeaders(cookie), "content-type": "application/json" },
      method: "POST",
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
  if (!response.body) {
    throw new Error("The gateway returned no response body to stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let seenFirst = false;

  while (!signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- an SSE body arrives in order; the next chunk cannot be asked for before this one lands.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith(DATA_PREFIX)) {
        continue;
      }
      const payload = trimmed.slice(DATA_PREFIX.length).trim();
      if (payload === DONE) {
        continue;
      }
      const delta = deltaOf(payload);
      if (delta === undefined || delta === "") {
        continue;
      }
      if (!seenFirst) {
        seenFirst = true;
        onFirstDelta();
      }
      onDelta(delta);
    }
  }
};
