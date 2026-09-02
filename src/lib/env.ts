import { readFileSync } from "node:fs";

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Load a dotenv-style file into `process.env` WITHOUT going through a shell.
 *
 * The AI Pass cookie contains `;` and spaces, which a POSIX shell `source` would
 * split into separate commands and truncate. We split each line on the first `=`
 * and keep the rest verbatim, apart from one matched pair of surrounding quotes.
 * A real environment variable (e.g. systemd `Environment=AIPASS_HOST`) always
 * wins; the file only fills what is unset.
 */
const unquote = (value: string): string => {
  const quote = value.at(0);
  const quoted =
    value.length >= 2 &&
    (quote === '"' || quote === "'") &&
    value.at(-1) === quote;
  return quoted ? value.slice(1, -1) : value;
};

const loadEnvFile = (path: string): void => {
  let contents: string;
  try {
    contents = readFileSync(path, "utf-8");
  } catch {
    // the file is optional
    return;
  }
  for (const raw of contents.split("\n")) {
    const line = raw.replace(/\r$/u, "");
    if (line.length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (process.env[key] === undefined) {
      process.env[key] = unquote(line.slice(eq + 1));
    }
  }
};

const envFile =
  process.env.AIPASS_ENV_FILE ??
  `${process.env.HOME ?? "."}/.config/aipass-proxy.env`;
loadEnvFile(envFile);

const DEFAULT_PORT = 3789;

/**
 * Validated environment. The template ships `AIPASS_COOKIE=""`, so
 * `emptyStringAsUndefined` makes an unfilled template fail the same way a
 * missing variable does, instead of starting a proxy that 401s on every call.
 */
export const env = createEnv({
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    for (const issue of issues) {
      const name = issue.path?.join(".") ?? "env";
      console.error(`FATAL: ${name}: ${issue.message}`);
    }
    console.error(`Set the above in ${envFile} (or the process environment).`);
    process.exit(1);
  },
  runtimeEnv: process.env,
  server: {
    AIPASS_COOKIE: z.string().min(1),
    AIPASS_HOST: z.string().min(1).default("127.0.0.1"),
    AIPASS_ORIGIN: z.url().default("https://de.aipass.net"),
    AIPASS_PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  },
});
