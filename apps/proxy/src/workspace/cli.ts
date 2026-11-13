#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { cookieFromValue, sessionTokenOf } from "@thaipass/core/aipass/session";
import { config } from "@thaipass/core/lib/config";
import { z } from "zod";

import { readLogin } from "../login/flow";
import { ownEndpoint } from "./browser";
import { isWorkspaceModel, WORKSPACE_MODELS } from "./models";
import { openAssist } from "./sessions";

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

const USAGE = `Usage: bun run workspace [command] [options]

Opens and manages Gemini Enterprise / Google Workspace for AiPASS.

Commands:
  ask <prompt>     Ask a workspace model, signing in through a remote browser
  open             Open Gemini Enterprise in browser (default)
  status           Check your Gemini Enterprise entitlement status
  models           List models available for coding agents (T3 Code, Claude Code, Codex)

Options:
  -m, --model      Specify workspace model (default: gemini-4-argon)
  -c, --cookie     Specify the AI Pass session cookie explicitly
  -b, --browser-token
                   Browserless key or ws(s):// endpoint for 'ask'
                   (or set THAIPASS_BROWSER_WS)
      --no-browser Print the launch URL instead of opening browser
  -h, --help       Show this help message
`;

const entitlementResponseSchema = z.object({
  availability: z.string().optional(),
  entitlement: z
    .object({
      claimSource: z.string(),
      lastLaunchedAt: z.string().nullable().optional(),
      redeemedAt: z.string(),
      status: z.string(),
    })
    .nullable()
    .optional(),
  settings: z
    .object({ minimumExp: z.number().optional() })
    .nullable()
    .optional(),
});

const handoffResponseSchema = z.object({
  appUrl: z.string().optional(),
});

const codexAuthSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  api_key: z.string().optional(),
});

const resolveCookie = async (cliCookie?: string): Promise<string | null> => {
  if (cliCookie) {
    return cliCookie;
  }
  if (process.env.AIPASS_COOKIE) {
    return process.env.AIPASS_COOKIE;
  }

  // Check ~/.codex-thaipass/auth.json
  const codexAuthPath = path.join(homedir(), ".codex-thaipass", "auth.json");
  if (existsSync(codexAuthPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(codexAuthPath, "utf-8"));
      const data = codexAuthSchema.parse(parsed);
      if (data.OPENAI_API_KEY) {
        return data.OPENAI_API_KEY;
      }
      if (data.api_key) {
        return data.api_key;
      }
    } catch {
      // ignore
    }
  }

  // Check stored thaipass login
  const login = await readLogin();
  if (login?.token) {
    const lookup = cookieFromValue(login.token);
    if (lookup.ok) {
      return lookup.cookie;
    }
  }

  return null;
};

const OPENERS = [
  { cmd: "open", platform: "darwin" },
  { cmd: "xdg-open", platform: "linux" },
  { cmd: "start", platform: "win32" },
] as const;

const openBrowser = (url: string): void => {
  const opener = OPENERS.find(
    (candidate) => candidate.platform === process.platform
  );
  if (!opener) {
    console.log(`Open in browser: ${url}`);
    return;
  }
  const child = spawn(opener.cmd, [url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
};

interface AskOptions {
  readonly browser: string | undefined;
  readonly cookie: string;
  readonly model: string;
  readonly prompt: string;
}

const ask = async (options: AskOptions): Promise<number> => {
  const { browser, cookie, model, prompt } = options;
  if (!prompt) {
    console.error(
      "Error: Missing prompt for 'ask'. Example: bun run workspace ask 'Explain binary search'"
    );
    return EXIT_USAGE;
  }
  if (!isWorkspaceModel(model)) {
    console.error(
      `Error: ${model} is not a workspace model. Try: ${WORKSPACE_MODELS.join(", ")}`
    );
    return EXIT_USAGE;
  }
  if (!browser) {
    console.error(
      "Error: 'ask' signs in through a browser you bring. Pass --browser-token <Browserless key or ws(s):// URL> or set THAIPASS_BROWSER_WS."
    );
    return EXIT_USAGE;
  }
  const sessionToken = sessionTokenOf(cookie);
  if (!sessionToken) {
    console.error("Error: the cookie carries no AI Pass session token.");
    return EXIT_USAGE;
  }
  const events = await openAssist({
    endpoint: ownEndpoint(browser),
    model,
    prompt,
    sessionToken,
    signal: undefined,
  });
  for await (const event of events) {
    if (event.kind === "delta") {
      process.stdout.write(event.text);
    } else if (event.kind === "error") {
      console.error(`\nError: ${event.message}`);
      return EXIT_FAILED;
    }
  }
  process.stdout.write("\n");
  return EXIT_OK;
};

const main = async (): Promise<number> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "browser-token": { short: "b", type: "string" },
      cookie: { short: "c", type: "string" },
      help: { short: "h", type: "boolean" },
      model: { short: "m", type: "string" },
      "no-browser": { type: "boolean" },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return EXIT_OK;
  }

  const command = positionals[0] ?? "open";
  const cookie = await resolveCookie(values.cookie);

  if (!cookie) {
    console.error("Error: Missing AI Pass session cookie.");
    console.error(
      "Provide it with --cookie, AIPASS_COOKIE, or sign in via ~/.codex-thaipass"
    );
    return EXIT_USAGE;
  }

  if (command === "ask") {
    return await ask({
      browser: values["browser-token"] ?? process.env.THAIPASS_BROWSER_WS,
      cookie,
      model: values.model ?? WORKSPACE_MODELS[0],
      prompt: positionals.slice(1).join(" "),
    });
  }

  if (command === "models") {
    console.log(
      "\nActive Upstream Models (Ready for T3 Code / Claude Code / Codex):\n"
    );
    console.log(
      "  • claude-opus-5-5@azure   Latest Claude 5.5 flagship (Anthropic protocol)"
    );
    console.log(
      "  • gpt-6-luna              OpenAI GPT-6 model (OpenAI / Responses protocol)"
    );
    console.log("  • gpt-6.1-sol             OpenAI GPT-6.1 model");
    console.log("  • DeepSeek-V4-Flash       DeepSeek V4 high-speed model");
    console.log(
      "  • gemini-3.5-flash-lite   Free tier default model (0 credits)"
    );
    console.log("  • glm-5.3                 General language model");
    console.log("  • Kimi-K2.7-Code          Moonshot code specialist");
    console.log("  • Mistral-Large-3         Mistral flagship\n");
    console.log("Gemini Enterprise (Google Cloud Workspace):");
    console.log(
      "  • Gemini 4 Argon          Flagship model on Vertex AI Search"
    );
    console.log(
      "  • Gemini 3.1 Pro / Flash   Agentic & Workspace integrated models\n"
    );
    return EXIT_OK;
  }

  // Check entitlement status
  const entRes = await fetch(
    `${config.origin}/loaders/profile-entitlement?externalPartner=gemini_enterprise`,
    {
      headers: {
        cookie,
        referer: `${config.origin}/settings/profile`,
        "user-agent": "Mozilla/5.0",
      },
    }
  );

  if (!entRes.ok) {
    console.error(`Upstream error: ${entRes.status}`);
    return EXIT_FAILED;
  }

  const rawEnt: unknown = await entRes.json();
  const entData = entitlementResponseSchema.parse(rawEnt);
  const { entitlement } = entData;

  console.log("\n==============================================");
  console.log("  Gemini Enterprise (Workspace) Status");
  console.log("==============================================");
  if (entitlement) {
    console.log(`Status       : ${entitlement.status.toUpperCase()}`);
    console.log(`Source       : ${entitlement.claimSource}`);
    console.log(`Redeemed At  : ${entitlement.redeemedAt}`);
    console.log(`Last Active  : ${entitlement.lastLaunchedAt ?? "N/A"}`);
  } else {
    console.log(
      `Status       : NOT YET CLAIMED (Availability: ${entData.availability ?? "unknown"})`
    );
    if (entData.settings?.minimumExp) {
      console.log(
        `Requirement  : Accumulate ${entData.settings.minimumExp} EXP in LMS to claim`
      );
    }
  }

  if (command === "status") {
    return EXIT_OK;
  }

  if (command === "open") {
    // Get Handoff / SSO launch URL
    const handoffRes = await fetch(
      `${config.origin}/actions/ge-academy-handoff`,
      {
        headers: {
          cookie,
          referer: `${config.origin}/settings/profile`,
          "user-agent": "Mozilla/5.0",
        },
        method: "POST",
      }
    );

    let targetUrl =
      "https://auth.cloud.google/signin/locations/global/workforcePools/aip-prd-citizens/providers/aipass?continueUrl=https%3A%2F%2Fvertexaisearch.cloud.google%2Fus%2Fhome%2Fcid%2F3c0d3b0e-1de2-4577-bcea-16b67f1f289e";

    if (handoffRes.ok) {
      const rawHandoff: unknown = await handoffRes.json();
      const handoffData = handoffResponseSchema.parse(rawHandoff);
      if (handoffData.appUrl) {
        targetUrl = handoffData.appUrl;
      }
    }

    console.log(`\nLaunching Google Cloud Gemini Enterprise...`);
    console.log(`URL: ${targetUrl}\n`);

    if (values["no-browser"]) {
      console.log("Please copy and open the above link in your browser.");
    } else {
      openBrowser(targetUrl);
      console.log("Opened Gemini Enterprise in your browser.");
    }
    return EXIT_OK;
  }

  console.error(`Unknown command: ${command}`);
  console.log(USAGE);
  return EXIT_USAGE;
};

process.exit(await main());
