import { Elysia } from "elysia";

import { openapiDocument } from "../openapi/document";
import { scalarPage } from "../openapi/scalar";

export const docsRoutes = new Elysia()
  .get("/openapi.json", () => openapiDocument)
  .get(
    "/",
    () =>
      new Response(scalarPage, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
  );
