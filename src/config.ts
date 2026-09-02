import { readFileSync } from "node:fs";

/**
 * Load a dotenv-style file into `process.env` WITHOUT going through a shell.
 *
 * The AI Pass cookie contains `;` and spaces, which a POSIX shell `source` would
 * split into separate commands and truncate. We split each line on the first `=`
 * and keep the rest verbatim. A real environment variable (e.g. systemd
 * `Environment=AIPASS_HOST`) always wins; the file only fills what is unset.
 */
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
      process.env[key] = line.slice(eq + 1);
    }
  }
};

const envFile =
  process.env.AIPASS_ENV_FILE ??
  `${process.env.HOME ?? "."}/.config/aipass-proxy.env`;
loadEnvFile(envFile);

export interface Config {
  readonly origin: string;
  readonly host: string;
  readonly port: number;
  readonly cookie: string;
  readonly userAgent: string;
  readonly idleTimeout: number;
}

export const config: Config = {
  cookie: process.env.AIPASS_COOKIE ?? "",
  host: process.env.AIPASS_HOST ?? "127.0.0.1",
  idleTimeout: 240,
  origin: process.env.AIPASS_ORIGIN ?? "https://de.aipass.net",
  port: Number(process.env.AIPASS_PORT ?? "3789"),
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
};

if (config.cookie.length === 0) {
  console.error(`FATAL: AIPASS_COOKIE is empty (set it in ${envFile})`);
  process.exit(1);
}
