/**
 * Everything the dashboard knows about the thaipass proxy's HTTP surface.
 * The session cookie never leaves the browser, so every call here runs
 * client-side against whatever origin the user pointed the dashboard at.
 */

export interface ProxyHealth {
  models: number;
  ok: boolean;
  origin: string;
  prices?: boolean;
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

export interface ModelPricing {
  completion: number;
  prompt: number;
}

export interface CatalogModel {
  free: boolean;
  id: string;
  kind: ModelKind;
  options: VideoOptions | null;
  pricing?: ModelPricing | null;
  ready: boolean;
  thinking: readonly string[] | null;
}

export interface ChatMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

export const SESSION_TOKEN_NAME = "__Secure-ai_passport_auth.session_token";

export const hasSessionToken = (raw: string): boolean =>
  raw.includes(SESSION_TOKEN_NAME);

const TRAILING_SLASHES = /\/+$/u;
const COOKIE_PREFIX = /^cookie:\s*/iu;
const BEARER_PREFIX = /^(?:authorization:\s*)?bearer\s+/iu;
const COOKIE_LINE_PREFIX = /^\s*cookie:\s*/iu;
const LINE_BREAK_REGEX = /\r?\n/u;
const TRAILING_BACKSLASH_REGEX = /\\\s*$/u;

const CURL_HEADER_REGEX =
  /(?:-H|--header)\s+(?:'cookie:\s*(?<single>[^']+)'|"cookie:\s*(?<double>[^"]+)")/iu;

const CURL_COOKIE_FLAG_REGEX =
  /(?:-b|--cookie)\s+(?:'(?<single>[^']+)'|"(?<double>[^"]+)"|(?<bare>\S+))/iu;

const CURL_LOOSE_REGEX =
  /(?:-H|--header)\s+['"]?(?:cookie:\s*)?(?<loose>[^\r\n"';]+__Secure-ai_passport_auth\.session_token[^\r\n"';]*)/iu;

const ENV_ASSIGNMENT_REGEX =
  /(?:(?:export\s+)?(?:AIPASS_COOKIE|COOKIE)\s*=\s*|set\s+-x\s+(?:AIPASS_COOKIE|COOKIE)\s+)['"]?(?<val>[^'"\r\n]+)['"]?/iu;

const JSON_PROPERTY_REGEX =
  /["']?cookie["']?\s*[:=]\s*["'](?<val>[^"']+)["']/iu;

const extractCurlCookie = (text: string): string | null => {
  const headerMatch = text.match(CURL_HEADER_REGEX);
  if (headerMatch?.groups) {
    return headerMatch.groups.single ?? headerMatch.groups.double ?? null;
  }
  const flagMatch = text.match(CURL_COOKIE_FLAG_REGEX);
  if (flagMatch?.groups) {
    return (
      flagMatch.groups.single ??
      flagMatch.groups.double ??
      flagMatch.groups.bare ??
      null
    );
  }
  const looseMatch = text.match(CURL_LOOSE_REGEX);
  if (looseMatch?.groups?.loose) {
    return looseMatch.groups.loose;
  }
  return null;
};

const extractHeaderLineCookie = (text: string): string | null => {
  const lines = text.split(LINE_BREAK_REGEX);
  const cookieLine = lines.find((line) => COOKIE_LINE_PREFIX.test(line));
  return cookieLine ? cookieLine.replace(COOKIE_LINE_PREFIX, "") : null;
};

const extractSnippetCookie = (text: string): string | null => {
  const envMatch = text.match(ENV_ASSIGNMENT_REGEX);
  if (envMatch?.groups?.val) {
    return envMatch.groups.val;
  }
  const jsonMatch = text.match(JSON_PROPERTY_REGEX);
  if (jsonMatch?.groups?.val) {
    return jsonMatch.groups.val;
  }
  return null;
};

const stripQuotes = (val: string): string => {
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'")) ||
    (val.startsWith("`") && val.endsWith("`"))
  ) {
    return val.slice(1, -1).trim();
  }
  return val;
};

/** `http://host:3001/` and `http://host:3001` have to build the same URL. */
export const normalizeProxyUrl = (raw: string): string =>
  raw.trim().replace(TRAILING_SLASHES, "");

/**
 * Normalizes input pasted by users:
 * - A bare cookie or token string
 * - A `Cookie:` header from devtools
 * - An `Authorization: Bearer …` line out of a config
 * - A full cURL command (-H "cookie: ...", --header, -b, --cookie)
 * - Raw multi-line DevTools request headers
 * - Shell env variables (AIPASS_COOKIE=..., COOKIE=...)
 * - JSON / JS snippets
 */
export const normalizeCookie = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const candidate =
    extractCurlCookie(trimmed) ??
    extractHeaderLineCookie(trimmed) ??
    extractSnippetCookie(trimmed) ??
    trimmed;

  const stripped = candidate
    .replace(COOKIE_PREFIX, "")
    .replace(BEARER_PREFIX, "")
    .trim();

  return stripQuotes(stripped).replace(TRAILING_BACKSLASH_REGEX, "").trim();
};

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

export interface CompletionCredits {
  available: number;
  limit: number;
  reset_at: string;
  spent?: number;
  used: number;
}

export interface CompletionUsage {
  completion_tokens?: number;
  cost?: number;
  credits?: CompletionCredits;
  prompt_tokens?: number;
  total_tokens?: number;
}

export interface StreamChatParams {
  cookie: string;
  messages: readonly ChatMessage[];
  model: string;
  onDelta: (delta: string) => void;
  onFirstDelta: () => void;
  onUsage?: (usage: CompletionUsage) => void;
  proxyUrl: string;
  signal: AbortSignal;
}

const DATA_PREFIX = "data:";
const DONE = "[DONE]";

interface ChunkBody {
  choices?: { delta?: { content?: string } }[];
  usage?: CompletionUsage;
}

const parseChunk = (payload: string): ChunkBody | undefined => {
  try {
    // SAFETY: an OpenAI-shaped SSE chunk; every field read in choices and usage is optional.
    return JSON.parse(payload) as ChunkBody;
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
  onUsage,
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
      const chunk = parseChunk(payload);
      if (chunk?.usage && onUsage) {
        onUsage(chunk.usage);
      }
      const delta = chunk?.choices?.[0]?.delta?.content;
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
