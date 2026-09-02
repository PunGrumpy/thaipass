import { env } from "./env.ts";

/** Everything the proxy needs at runtime: validated env plus fixed constants. */
export interface Config {
  readonly origin: string;
  readonly host: string;
  readonly port: number;
  readonly cookie: string;
  readonly userAgent: string;
  readonly idleTimeout: number;
}

export const config: Config = {
  cookie: env.AIPASS_COOKIE,
  host: env.AIPASS_HOST,
  // a slow model can take minutes to emit its first token
  idleTimeout: 240,
  origin: env.AIPASS_ORIGIN,
  port: env.AIPASS_PORT,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
};
