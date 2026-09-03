import { expect, test } from "bun:test";

import { z } from "zod";

import { app } from "../app";

const REF_PATTERN = /"\$ref":"(?<target>[^"]+)"/gu;
const CATALOG_SIZE = 23;

const documentSchema = z.object({
  components: z.object({
    schemas: z.record(z.string(), z.unknown()),
    securitySchemes: z.record(z.string(), z.unknown()),
  }),
  info: z.object({ title: z.string(), version: z.string() }),
  openapi: z.string(),
  paths: z.record(z.string(), z.unknown()),
});

type Document = z.infer<typeof documentSchema>;

const requestSchema = z.object({
  properties: z.object({ model: z.object({ enum: z.array(z.string()) }) }),
});

const postSchema = z.object({
  post: z.object({
    requestBody: z.object({
      content: z.object({
        "application/json": z.object({
          schema: z.object({ $ref: z.string() }),
        }),
      }),
    }),
    responses: z.object({
      "200": z.object({ content: z.record(z.string(), z.unknown()) }),
    }),
  }),
});

const get = async (path: string): Promise<Response> =>
  await app.fetch(new Request(`https://proxy.test${path}`));

const document = async (): Promise<Document> => {
  const response = await get("/openapi.json");
  return documentSchema.parse(await response.json());
};

test("serves the scalar page at the root", async () => {
  const response = await get("/");
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain("cdn.jsdelivr.net/npm/@scalar/api-reference");
  expect(html).toContain("openapi.json");
});

test("serves the document the page points at", async () => {
  const response = await get("/openapi.json");
  const spec = documentSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(spec.openapi).toBe("3.0.3");
  expect(spec.info.title).toBe("AIPass Proxy");
});

test("documents every route the app serves", async () => {
  const spec = await document();
  expect(Object.keys(spec.paths).toSorted()).toEqual([
    "/health",
    "/v1/chat/completions",
    "/v1/messages",
    "/v1/models",
  ]);
});

test("resolves every schema reference it makes", async () => {
  const spec = await document();
  const defined = Object.keys(spec.components.schemas).map(
    (name) => `#/components/schemas/${name}`
  );
  const used = [...JSON.stringify(spec).matchAll(REF_PATTERN)].map(
    (match) => match.groups?.target ?? ""
  );
  expect(used.length).toBeGreaterThan(0);
  for (const reference of used) {
    expect(defined).toContain(reference);
  }
});

test("lists every served model in both request schemas", async () => {
  const { components } = await document();
  for (const name of ["ChatRequest", "MessagesRequest"]) {
    const request = requestSchema.parse(components.schemas[name]);
    expect(request.properties.model.enum).toContain("gemini-3.1-flash-lite");
    expect(request.properties.model.enum).toHaveLength(CATALOG_SIZE);
  }
});

test("takes each request body from its registered model", async () => {
  const spec = await document();
  const chat = postSchema.parse(spec.paths["/v1/chat/completions"]);
  const messages = postSchema.parse(spec.paths["/v1/messages"]);
  expect(chat.post.requestBody.content["application/json"].schema.$ref).toBe(
    "#/components/schemas/ChatRequest"
  );
  expect(
    messages.post.requestBody.content["application/json"].schema.$ref
  ).toBe("#/components/schemas/MessagesRequest");
});

test("offers both the buffered and the streamed reply on both model routes", async () => {
  const spec = await document();
  for (const path of ["/v1/chat/completions", "/v1/messages"]) {
    const route = postSchema.parse(spec.paths[path]);
    expect(Object.keys(route.post.responses["200"].content).toSorted()).toEqual(
      ["application/json", "text/event-stream"]
    );
  }
});

test("marks only the two model routes as needing the cookie", async () => {
  const spec = await document();
  const secured = Object.entries(spec.paths)
    .filter(([, item]) => JSON.stringify(item).includes("aipassCookie"))
    .map(([path]) => path);
  expect(secured).toEqual(["/v1/chat/completions", "/v1/messages"]);
});
