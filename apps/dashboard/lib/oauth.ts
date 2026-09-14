import { gatewayFetch, normalizeProxyUrl } from "@/lib/proxy";

export interface AuthorizeRequest {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scope: string | null;
  state: string | null;
}

export const SCOPE_NAMES = ["chat", "media", "lms", "models", "usage"] as const;

export type ScopeName = (typeof SCOPE_NAMES)[number];

const KNOWN: ReadonlySet<string> = new Set<string>(SCOPE_NAMES);

const isScopeName = (value: string): value is ScopeName => KNOWN.has(value);

export const scopesOf = (scope: string | null): readonly ScopeName[] => {
  const asked = (scope ?? "chat models usage")
    .split(/\s+/u)
    .filter(isScopeName);
  const unique = new Set(
    asked.length > 0 ? asked : ["chat", "models", "usage"]
  );
  return SCOPE_NAMES.filter((name) => unique.has(name));
};

export const readAuthorizeRequest = (
  params: URLSearchParams
): AuthorizeRequest | null => {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  if (!(clientId && redirectUri && codeChallenge)) {
    return null;
  }
  return {
    clientId,
    codeChallenge,
    redirectUri,
    scope: params.get("scope"),
    state: params.get("state"),
  };
};

export interface Account {
  email: string | null;
  id: string;
  name: string | null;
  organization: string | null;
}

interface UserinfoBody {
  account: Account;
  session_expires_at: string | null;
}

const authHeaders = (cookie: string): HeadersInit => ({
  authorization: `Bearer ${cookie}`,
});

const readOAuthError = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  // SAFETY: every non-2xx from /oauth is RFC 6749 shaped; the optional chain
  const described = (body as { error_description?: string } | null)
    ?.error_description;
  return described ?? `HTTP ${response.status}: ${response.statusText}`;
};

export const fetchAccount = async (
  proxyUrl: string,
  cookie: string,
  signal?: AbortSignal
): Promise<Account> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/oauth/userinfo`,
    { cache: "no-store", headers: authHeaders(cookie), signal }
  );
  if (!response.ok) {
    throw new Error(await readOAuthError(response));
  }
  // SAFETY: GET /oauth/userinfo returns the Userinfo schema on 200; every
  const body = (await response.json()) as UserinfoBody;
  return body.account;
};

export const requestCode = async (
  proxyUrl: string,
  cookie: string,
  request: AuthorizeRequest
): Promise<string> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/oauth/code`,
    {
      body: JSON.stringify({
        client_id: request.clientId,
        code_challenge: request.codeChallenge,
        code_challenge_method: "S256",
        redirect_uri: request.redirectUri,
        scope: request.scope ?? undefined,
      }),
      headers: { ...authHeaders(cookie), "content-type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(await readOAuthError(response));
  }
  // SAFETY: POST /oauth/code returns the CodeResponse schema on 200.
  const body = (await response.json()) as { code: string };
  return body.code;
};

const VERIFIER_BYTES = 48;

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export const mintToken = async (
  proxyUrl: string,
  cookie: string,
  request: { clientId: string; scope: string }
): Promise<TokenGrant> => {
  const verifier = base64url(
    crypto.getRandomValues(new Uint8Array(VERIFIER_BYTES))
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = base64url(new Uint8Array(digest));
  const redirectUri = `${window.location.origin}/authorize`;

  const code = await requestCode(proxyUrl, cookie, {
    clientId: request.clientId,
    codeChallenge: challenge,
    redirectUri,
    scope: request.scope,
    state: null,
  });

  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/oauth/token`,
    {
      body: JSON.stringify({
        client_id: request.clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(await readOAuthError(response));
  }
  // SAFETY: POST /oauth/token returns the TokenResponse schema on 200.
  return (await response.json()) as TokenGrant;
};

export interface TokenGrant {
  access_token: string;
  account: Account;
  expires_in: number;
  scope: string;
}

export const completionUrl = (
  request: AuthorizeRequest,
  outcome: { code: string } | { error: string }
): string => {
  const url = new URL(request.redirectUri);
  if ("code" in outcome) {
    url.searchParams.set("code", outcome.code);
  } else {
    url.searchParams.set("error", outcome.error);
  }
  if (request.state !== null) {
    url.searchParams.set("state", request.state);
  }
  return url.toString();
};
