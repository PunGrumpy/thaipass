#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

import { generateTokenKey } from "@thaipass/core/auth/seal";

import { env } from "../lib/env";
import "../lib/settings";
import {
  accountLabel,
  authorizeUrl,
  createPkce,
  createState,
  credentialsPath,
  DEFAULT_CLIENT_ID,
  describeExpiry,
  exchangeCode,
  forgetLogin,
  loginFrom,
  readCallback,
  readLogin,
  saveLogin,
} from "./flow";

/**
 * Login with thaipass, from a terminal. One command opens the browser where
 * the AI Pass session already lives, and what comes back is a token for this
 * machine — not a cookie anybody had to copy.
 */

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const ANY_PORT = 0;

export const USAGE = `Usage: bun run login [command] [options]

Signs this machine in to a thaipass gateway. The browser opens the gateway's
consent screen, you approve, and the token lands in ${credentialsPath()}.

Commands:
  login            Sign in (the default)
  token            Print the stored token, for an environment variable
  whoami           Show whose account the stored token opens
  logout           Forget the stored token
  keygen           Print a THAIPASS_TOKEN_KEY for a gateway to issue tokens with

Options:
  -p, --proxy <url>   The gateway to sign in to (default ${env.NEXT_PUBLIC_PROXY_URL})
  -w, --web <url>     Where its dashboard is (default ${env.NEXT_PUBLIC_WEB_URL})
  -s, --scope <list>  Space separated scopes to ask for (default chat models usage)
  -c, --client <id>   How this machine names itself (default ${DEFAULT_CLIENT_ID})
      --port <n>      The loopback port to listen on (default: any free port)
      --no-browser    Print the link instead of opening it
  -h, --help          Show this message

Exit status: 0 on success, 1 when the login fails, 2 on a usage error.`;

const OPENERS = [
  ["xdg-open"],
  ["open"],
  ["wslview"],
  ["cmd.exe", "/c", "start", ""],
] as const;

/** Best effort: a browser that will not open is a link the reader can paste. */
const openBrowser = (url: string): void => {
  for (const [command, ...args] of OPENERS) {
    try {
      const child = spawn(command, [...args, url], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return;
    } catch {
      // Try the next one.
    }
  }
};

const DONE_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Signed in</title>
<body style="font:14px ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;height:100dvh;margin:0">
<main style="text-align:center">
<h1 style="font-size:15px;margin:0 0 6px">Signed in to thaipass</h1>
<p style="color:#666;margin:0">You can close this tab and go back to the terminal.</p>
</main>`;

const FAILED_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Not signed in</title>
<body style="font:14px ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;height:100dvh;margin:0">
<main style="text-align:center">
<h1 style="font-size:15px;margin:0 0 6px">That login did not finish</h1>
<p style="color:#666;margin:0">The terminal has the reason.</p>
</main>`;

interface Waiting {
  readonly code: Promise<string>;
  readonly port: number;
  readonly stop: () => void;
}

/**
 * Listens on loopback for the browser to arrive with the code. Nothing else
 * can reach this port from outside the machine, which is what makes a redirect
 * to 127.0.0.1 safe for a client that can keep no secret.
 */
const waitForCode = (state: string, port: number): Waiting => {
  const { promise, reject, resolve } = Promise.withResolvers<string>();

  const server = Bun.serve({
    fetch: (request) => {
      const callback = readCallback(request.url, state);
      if (callback.ok) {
        resolve(callback.code);
        return new Response(DONE_PAGE, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      reject(new Error(callback.reason));
      return new Response(FAILED_PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 400,
      });
    },
    hostname: "127.0.0.1",
    port,
  });

  const timer = setTimeout(() => {
    reject(new Error("nobody approved this login within five minutes"));
  }, LOGIN_TIMEOUT_MS);

  return {
    code: promise,
    port: server.port ?? port,
    stop: () => {
      clearTimeout(timer);
      server.stop(true);
    },
  };
};

export interface LoginOptions {
  readonly client: string;
  readonly openBrowser: boolean;
  readonly port: number;
  readonly proxyUrl: string;
  readonly scope: string | undefined;
  readonly webUrl: string;
}

const runLogin = async (options: LoginOptions): Promise<number> => {
  const pkce = createPkce();
  const state = createState();
  const waiting = waitForCode(state, options.port);
  const redirectUri = `http://127.0.0.1:${waiting.port}/callback`;
  const link = authorizeUrl({
    challenge: pkce.challenge,
    clientId: options.client,
    redirectUri,
    scope: options.scope,
    state,
    webUrl: options.webUrl,
  });

  process.stdout.write(`Approve this login in the browser:\n\n  ${link}\n\n`);
  if (options.openBrowser) {
    openBrowser(link);
  }

  try {
    const code = await waiting.code;
    const reply = await exchangeCode({
      clientId: options.client,
      code,
      proxyUrl: options.proxyUrl,
      redirectUri,
      verifier: pkce.verifier,
    });
    const login = loginFrom(reply, options.proxyUrl);
    await saveLogin(login);

    process.stdout.write(
      `Signed in as ${accountLabel(login.account)} (${login.scope}), ${describeExpiry(login.expiresAt)}.\n` +
        `Saved to ${credentialsPath()}.\n\n` +
        "Point a client at it:\n\n" +
        `  export ANTHROPIC_BASE_URL=${options.proxyUrl}\n` +
        "  export ANTHROPIC_AUTH_TOKEN=$(bun run login token)\n"
    );
    return EXIT_OK;
  } catch (error) {
    process.stderr.write(
      `Not signed in: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return EXIT_FAILED;
  } finally {
    waiting.stop();
  }
};

const runToken = async (): Promise<number> => {
  const login = await readLogin();
  if (!login) {
    process.stderr.write("No stored login. Run `bun run login` first.\n");
    return EXIT_FAILED;
  }
  process.stdout.write(`${login.token}\n`);
  return EXIT_OK;
};

const runWhoami = async (): Promise<number> => {
  const login = await readLogin();
  if (!login) {
    process.stderr.write("No stored login. Run `bun run login` first.\n");
    return EXIT_FAILED;
  }
  const { account } = login;
  process.stdout.write(
    `${accountLabel(account)}${account.email ? ` <${account.email}>` : ""}\n` +
      `${account.organization ?? "no organization"} · ${login.scope} · ${describeExpiry(login.expiresAt)}\n` +
      `${login.proxyUrl}\n`
  );
  return login.expiresAt > Date.now() / 1000 ? EXIT_OK : EXIT_FAILED;
};

const runLogout = async (): Promise<number> => {
  const forgotten = await forgetLogin();
  process.stdout.write(
    forgotten
      ? `Forgot the login in ${credentialsPath()}.\n`
      : "There was no stored login.\n"
  );
  return EXIT_OK;
};

const runKeygen = (): number => {
  process.stdout.write(`THAIPASS_TOKEN_KEY=${generateTokenKey()}\n`);
  return EXIT_OK;
};

export const parseCliArgs = (argv: readonly string[]) => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: [...argv],
    options: {
      client: { short: "c", type: "string" },
      help: { default: false, short: "h", type: "boolean" },
      "no-browser": { type: "boolean" },
      port: { type: "string" },
      proxy: { short: "p", type: "string" },
      scope: { short: "s", type: "string" },
      web: { short: "w", type: "string" },
    },
    strict: true,
  });

  const command = positionals[0] ?? "login";
  const port = values.port === undefined ? ANY_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 0) {
    throw new Error("--port takes a port number");
  }

  return {
    command,
    help: values.help ?? false,
    options: {
      client: values.client ?? DEFAULT_CLIENT_ID,
      openBrowser: values["no-browser"] !== true,
      port,
      proxyUrl: (values.proxy ?? env.NEXT_PUBLIC_PROXY_URL).replace(
        /\/+$/u,
        ""
      ),
      scope: values.scope,
      webUrl: (values.web ?? env.NEXT_PUBLIC_WEB_URL).replace(/\/+$/u, ""),
    },
  };
};

const COMMANDS = new Set(["login", "token", "whoami", "logout", "keygen"]);

export const main = async (argv: readonly string[]): Promise<number> => {
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`
    );
    return EXIT_USAGE;
  }

  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_OK;
  }
  if (!COMMANDS.has(parsed.command)) {
    process.stderr.write(`Unknown command: ${parsed.command}\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  if (parsed.command === "token") {
    return await runToken();
  }
  if (parsed.command === "whoami") {
    return await runWhoami();
  }
  if (parsed.command === "logout") {
    return await runLogout();
  }
  if (parsed.command === "keygen") {
    return runKeygen();
  }
  return await runLogin(parsed.options);
};

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
