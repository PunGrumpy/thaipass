import { log } from "evlog";

import { app } from "./app";
import { config } from "./lib/config";
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
