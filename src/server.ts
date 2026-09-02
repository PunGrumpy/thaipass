import { log } from "evlog";

import { app } from "./app";
import { config } from "./lib/config";

app.listen({
  hostname: config.host,
  idleTimeout: config.idleTimeout,
  port: config.port,
});

log.info({
  msg: "listening",
  origin: config.origin,
  url: `http://${config.host}:${config.port}`,
});
