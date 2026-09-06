import { log } from "evlog";

import { configure } from "./config";
import { env } from "./env";

/** Applies the process environment to the upstream client before anything calls it. */
configure({ logger: log, origin: env.AIPASS_ORIGIN });

export const settings = {
  host: env.AIPASS_HOST,
  idleTimeout: 240,
  port: env.AIPASS_PORT,
} as const;
