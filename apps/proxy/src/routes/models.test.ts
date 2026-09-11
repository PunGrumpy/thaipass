import { afterEach, expect, test } from "bun:test";

import { sseResponse, stubUpstream } from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import { app } from "../app";
import { modelListSchema } from "./models";

const MODELS_PATH = "/loaders/list-models";

let upstream: Upstream;

/** The catalog is cached per cookie for five minutes, so each test reads its own. */
let accounts = 0;
const freshCookie = (): string => {
  accounts += 1;
  return `__Secure-ai_passport_auth.session_token=models${accounts}.def`;
};

const errorSchema = z.object({ error: z.object({ message: z.string() }) });

const list = async (cookie?: string): Promise<Response> =>
  await app.fetch(
    new Request("https://proxy.test/v1/models", {
      headers: cookie ? { authorization: `Bearer ${cookie}` } : {},
    })
  );

/** One entry as `/loaders/list-models` writes it, limited to the fields the proxy reads. */
interface CatalogEntryPayload {
  readonly id: string;
  readonly isFreeCredit?: boolean;
  readonly ready?: boolean;
  readonly thinkingConfig?: { readonly supportedLevels: readonly string[] };
}

const catalogOf =
  (entries: readonly CatalogEntryPayload[]) =>
  (path: string): Response | undefined =>
    path === MODELS_PATH ? Response.json({ data: entries }) : undefined;

afterEach(() => {
  upstream.restore();
});

test("needs the cookie, as the OpenAI and Anthropic model lists do", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await list();
  expect(response.status).toBe(401);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "Authorization"
  );
  expect(upstream.calls).not.toContain(MODELS_PATH);
});

test("lists what the account's catalog lists, in its order", async () => {
  upstream = stubUpstream(
    sseResponse([]),
    catalogOf([
      {
        id: "claude-opus-5@azure",
        thinkingConfig: { supportedLevels: ["low", "high", "max"] },
      },
      { id: "brand-new-model", ready: false },
      { id: "gemini-3.1-flash-lite", isFreeCredit: true },
      { id: "seedance-2.0-fast" },
      { id: "gpt-image-2" },
    ])
  );
  const response = await list(freshCookie());
  const listing = modelListSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(listing.data.map((model) => model.id)).toEqual([
    "claude-opus-5@azure",
    "brand-new-model",
    "gemini-3.1-flash-lite",
    "seedance-2.0-fast",
    "gpt-image-2",
  ]);
  const [claude, unknown, free, video, image] = listing.data;
  expect(claude?.thinking).toEqual(["low", "high", "max"]);
  expect(claude?.ready).toBe(true);
  expect(unknown).toMatchObject({ kind: "chat", ready: false, thinking: null });
  expect(free?.free).toBe(true);
  expect(video?.kind).toBe("video");
  expect(video?.options?.resolutions).toEqual(["480p", "720p"]);
  expect(image).toMatchObject({ kind: "image", options: null });
  expect("pricing" in (claude ?? {})).toBe(true);
});

test("leaves out a model the proxy knows but the catalog no longer lists", async () => {
  upstream = stubUpstream(
    sseResponse([]),
    catalogOf([{ id: "gemini-3.1-flash-lite" }])
  );
  const response = await list(freshCookie());
  const listing = modelListSchema.parse(await response.json());
  expect(listing.data.map((model) => model.id)).toEqual([
    "gemini-3.1-flash-lite",
  ]);
});

test("answers 502 when the catalog cannot be read", async () => {
  upstream = stubUpstream(sseResponse([]));
  const response = await list(freshCookie());
  expect(response.status).toBe(502);
  expect(errorSchema.parse(await response.json()).error.message).toContain(
    "no model catalog"
  );
});
