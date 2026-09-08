import { createEnv } from "@t3-oss/env-nextjs";
import { keys as core } from "@thaipass/core/keys";

export const env = createEnv({
  client: {},
  emptyStringAsUndefined: true,
  extends: [core()],
  runtimeEnv: {},
  server: {},
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
