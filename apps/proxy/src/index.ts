/**
 * Vercel's entry. `bun run build` writes dist/app.js with every dependency
 * inlined, core included, so the function carries no workspace symlink that
 * points outside this directory. Run the server locally from server.ts.
 */
export { default } from "../dist/app.js";
