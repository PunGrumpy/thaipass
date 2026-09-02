import { expect, test } from "bun:test";

import { z } from "zod";

import { app } from "../app";
import { openapiDocument } from "../openapi/document";

const REF_PATTERN = /"\$ref":"(?<target>[^"]+)"/gu;

const documentSchema = z.object({
  components: z.object({
    schemas: z.record(z.string(), z.unknown()),
    securitySchemes: z.record(z.string(), z.unknown()),
  }),
  info: z.object({ title: z.string(), version: z.string() }),
  openapi: z.string(),
  paths: z.record(z.string(), z.unknown()),
});

const get = async (path: string): Promise<Response> =>
  await app.fetch(new Request(`https://proxy.test${path}`));

const referencesUsed = (): string[] =>
  [...JSON.stringify(openapiDocument).matchAll(REF_PATTERN)].map(
    (match) => match.groups?.target ?? ""
  );

test("serves the scalar page at the root", async () => {
  const response = await get("/");
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain("cdn.jsdelivr.net/npm/@scalar/api-reference");
  expect(html).toContain(
    "createApiReference('#app', { url: '/openapi.json' })"
  );
});

test("serves the document the page points at", async () => {
  const response = await get("/openapi.json");
  const document = documentSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(document.openapi).toBe("3.1.0");
  expect(document.info.title).toBe("AIPass Proxy");
});

test("documents every route the app serves", () => {
  expect(Object.keys(openapiDocument.paths).toSorted()).toEqual([
    "/health",
    "/openapi.json",
    "/v1/chat/completions",
    "/v1/models",
  ]);
});

test("resolves every schema reference it makes", () => {
  const defined = Object.keys(openapiDocument.components.schemas).map(
    (name) => `#/components/schemas/${name}`
  );
  const used = referencesUsed();
  expect(used.length).toBeGreaterThan(0);
  for (const reference of used) {
    expect(defined).toContain(reference);
  }
});

test("lists every served model in the request schema", () => {
  const request = z
    .object({
      properties: z.object({ model: z.object({ enum: z.array(z.string()) }) }),
    })
    .parse(openapiDocument.components.schemas.ChatRequest);
  expect(request.properties.model.enum).toContain("gemini-3.1-flash-lite");
  expect(request.properties.model.enum).toHaveLength(23);
});

test("offers both the buffered and the streamed reply", () => {
  const chat = z
    .object({
      post: z.object({
        responses: z.object({
          "200": z.object({ content: z.record(z.string(), z.unknown()) }),
        }),
      }),
    })
    .parse(openapiDocument.paths["/v1/chat/completions"]);
  expect(Object.keys(chat.post.responses["200"].content).toSorted()).toEqual([
    "application/json",
    "text/event-stream",
  ]);
});

test("marks only the chat route as needing the cookie", () => {
  const secured = Object.entries(openapiDocument.paths)
    .filter(([, item]) => JSON.stringify(item).includes("aipassCookie"))
    .map(([path]) => path);
  expect(secured).toEqual(["/v1/chat/completions"]);
});
