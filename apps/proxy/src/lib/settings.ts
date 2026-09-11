import { configure } from "@thaipass/core/lib/config";
import { log } from "evlog";

import { env } from "./env";

// Runs on import, before any route reaches upstream.
configure({
  logger: log,
  origin: env.AIPASS_ORIGIN,
  pricesUrl: env.AIPASS_PRICES === "off" ? null : env.AIPASS_PRICES,
});

export const settings = {
  host: env.AIPASS_HOST,
  idleTimeout: 240,
  port: env.AIPASS_PORT,
} as const;
