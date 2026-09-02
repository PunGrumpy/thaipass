import { env } from "./env.ts";

export interface Config {
  readonly origin: string;
  readonly host: string;
  readonly port: number;
  readonly userAgent: string;
  readonly idleTimeout: number;
}

export const config: Config = {
  host: env.AIPASS_HOST,
  idleTimeout: 240,
  origin: env.AIPASS_ORIGIN,
  port: env.AIPASS_PORT,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
};
