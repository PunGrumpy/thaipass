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
/** Nothing here needs a page to look right, and every byte costs Browserless units. */
const UNNEEDED = /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|css)(?:\?|$)/iu;
const STEP_TIMEOUT_MS = 30_000;

const closeQuietly = async (close: () => Promise<void>): Promise<void> => {
  try {
    await close();
  } catch {
    // The browser is already gone, which is what closing wanted.
  }
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
  const { chromium } = await import("playwright-core");
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>;
  try {
    browser = await chromium.connectOverCDP(endpoint, {
      timeout: STEP_TIMEOUT_MS,
    });
  } catch (error) {
    throw withoutEndpoint(error, endpoint);
  }
  const abandon = (): void => {
    closeQuietly(() => browser.close());
  };
  signal.addEventListener("abort", abandon, { once: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        domain: ".aipass.net",
        httpOnly: true,
        name: SESSION_COOKIE,
        path: "/",
        sameSite: "Lax",
        secure: true,
        value: sessionToken,
      },
    ]);
    const page = await context.newPage();
    await page.route(UNNEEDED, (route) => route.abort());
    await page.goto(SSO_URL, { timeout: STEP_TIMEOUT_MS, waitUntil: "commit" });
    await page.waitForURL(LANDED, {
      timeout: STEP_TIMEOUT_MS,
      waitUntil: "commit",
    });
    const csesidx = new URL(page.url()).searchParams.get("csesidx");
    if (!csesidx) {
      throw new Error("sign-in landed without a csesidx");
    }
    const cookies = await context.cookies(`${WORKSPACE_ORIGIN}/`);
    return {
      cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
      csesidx,
    };
  } finally {
    signal.removeEventListener("abort", abandon);
    await closeQuietly(() => browser.close());
  }
};
