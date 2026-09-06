import { config } from "@thaipass/core/lib/config";
import { log } from "evlog";

import { app } from "./app";
import { settings } from "./lib/settings";

app.listen({
  hostname: settings.host,
  idleTimeout: settings.idleTimeout,
  port: settings.port,
});

log.info({
  msg: "listening",
  origin: config.origin,
  url: `http://${settings.host}:${settings.port}`,
});
