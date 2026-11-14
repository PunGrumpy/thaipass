import { aot } from "elysia/plugin/aot/vite";
import { build } from "tsdown";

/**
 * The Cloudflare Workers bundle. Workers refuse `new Function`, so Elysia
 * compiles every route here at build time instead of on the first request.
 *
 * Called through tsdown's API: loaded from a config file, the AOT plugin never
 * sees its entry in the module graph.
 */
await build({
  clean: true,
  config: false,
  deps: { alwaysBundle: [/.*/u], neverBundle: [/^node:/u] },
  dts: false,
  entry: { worker: "src/worker.ts" },
  format: "esm",
  outDir: ".wrangler/worker",
  platform: "neutral",
  plugins: [aot("src/app.ts", { target: "workerd" })],
});
