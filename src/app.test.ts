import { expect, test } from "bun:test";

import { z } from "zod";

import { app } from "./app";

const errorSchema = z.object({ error: z.object({ message: z.string() }) });

const messageOf = async (response: Response): Promise<string> =>
  errorSchema.parse(await response.json()).error.message;

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request("https://proxy.test/v1/chat/completions", {
    body,
    headers,
    method: "POST",
  });

test("answers 404 with the openai error shape", async () => {
  const response = await app.fetch(new Request("https://proxy.test/nope"));
  expect(response.status).toBe(404);
  expect(await messageOf(response)).toBe("not found");
});

test("answers 400 when a typed body is malformed json", async () => {
  const response = await app.fetch(
    post("{not json", { "content-type": "application/json" })
  );
  expect(response.status).toBe(400);
  expect(await messageOf(response)).toBe("invalid JSON body");
});

test("answers 400 when a body without a content type is malformed json", async () => {
  const response = await app.fetch(post("{not json"));
  expect(response.status).toBe(400);
  expect(await messageOf(response)).toBe("invalid JSON body");
});

test("answers 400 naming the field when the body fails validation", async () => {
  const response = await app.fetch(
    post(JSON.stringify({ messages: "hi" }), {
      "content-type": "application/json",
    })
  );
  expect(response.status).toBe(400);
  expect(await messageOf(response)).toContain("invalid request body");
});

test("lists the catalog without a credential", async () => {
  const response = await app.fetch(new Request("https://proxy.test/v1/models"));
  const listing = z
    .object({ data: z.array(z.object({ id: z.string() })), object: z.string() })
    .parse(await response.json());
  expect(response.status).toBe(200);
  expect(listing.object).toBe("list");
  expect(listing.data.length).toBeGreaterThan(0);
});

test("reports health without a credential", async () => {
  const response = await app.fetch(new Request("https://proxy.test/health"));
  const body = z
    .object({ models: z.number(), ok: z.boolean() })
    .parse(await response.json());
  expect(body.ok).toBe(true);
  expect(body.models).toBeGreaterThan(0);
});
