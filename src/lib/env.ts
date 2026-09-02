import { readFileSync } from "node:fs";

import { createEnv } from "@t3-oss/env-core";
import { log } from "evlog";
import { z } from "zod";

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

export const env = createEnv({
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    for (const issue of issues) {
      log.error({
        envFile,
        msg: "invalid environment",
        reason: issue.message,
        variable: issue.path?.join(".") ?? "env",
      });
    }
    process.exit(1);
  },
  runtimeEnv: process.env,
  server: {
    AIPASS_HOST: z.string().default("127.0.0.1"),
    AIPASS_ORIGIN: z.url().default("https://de.aipass.net"),
    AIPASS_PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  },
});
