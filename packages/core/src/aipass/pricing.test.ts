import { afterAll, expect, test } from "bun:test";

import { configure, DEFAULT_PRICES_URL } from "../lib/config";
import { costOf, modelPrices, priceFor, priceTable } from "./pricing";

const LIST = {
  data: [
    {
      id: "anthropic/claude-sonnet-5",
      pricing: { completion: "0.000015", prompt: "0.000003" },
    },
    {
      id: "~openai/gpt-5.6-terra",
      pricing: { completion: "0.00005", prompt: "0.00001" },
    },
    {
      id: "qwen/qwen3-next-80b-a3b-instruct",
      pricing: { completion: "0.0000011", prompt: "0.00000009" },
    },
    {
      id: "meta-llama/llama-4-scout",
      pricing: { completion: "0.0000003", prompt: "0.0000001" },
    },
    {
      id: "anthropic/claude-sonnet-5:batch",
      pricing: { completion: "0.0000075", prompt: "0.0000015" },
    },
    { id: "openai/gpt-image-2", pricing: { prompt: "0.00001" } },
  ],
};

const table = priceTable(LIST);

afterAll(() => {
  configure({ pricesUrl: DEFAULT_PRICES_URL });
});

test("matches a model whatever suffix AI Pass gives it", () => {
  expect(
    costOf(
      "claude-sonnet-5@default",
      { inputTokens: 1000, outputTokens: 100 },
      table
    )
  ).toBe(0.0045);
  expect(
    costOf("gpt-5.6-terra", { inputTokens: 100, outputTokens: 10 }, table)
  ).toBe(0.0015);
  expect(
    costOf(
      "qwen3-next-80b-a3b-instruct-maas",
      { inputTokens: 1_000_000, outputTokens: 0 },
      table
    )
  ).toBe(0.09);
  expect(
    costOf(
      "Llama-4-Scout-17B-16E-Instruct-1",
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      table
    )
  ).toBe(0.4);
});

test("looks up prompt and completion prices for a model", () => {
  expect(priceFor("claude-sonnet-5@default", table)).toEqual({
    completion: 0.000015,
    prompt: 0.000003,
    source: "anthropic/claude-sonnet-5",
  });
  expect(priceFor("unlisted-model", table)).toBeUndefined();
  expect(priceFor("claude-sonnet-5", null)).toBeUndefined();
});

test("prefers the plain id over a priced variant", () => {
  expect(table?.get("claude-sonnet-5")?.source).toBe(
    "anthropic/claude-sonnet-5"
  );
});

test("reports nothing for a model the list does not price", () => {
  expect(
    costOf("pathumma-thaillm-8b", { inputTokens: 10, outputTokens: 10 }, table)
  ).toBeUndefined();
  expect(
    costOf("gpt-image-2", { inputTokens: 10, outputTokens: 10 }, table)
  ).toBeUndefined();
  expect(
    costOf("claude-sonnet-5", { inputTokens: 10, outputTokens: 10 }, null)
  ).toBeUndefined();
});

test("rejects a list of the wrong shape", async () => {
  const realFetch = globalThis.fetch;
  const url = "https://prices.test/wrong";
  globalThis.fetch = Object.assign(
    (): Promise<Response> => Promise.resolve(Response.json({ data: "nope" })),
    { preconnect: realFetch.preconnect }
  );
  configure({ pricesUrl: url });
  try {
    expect(await modelPrices()).toBeNull();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("reads no prices at all when the source is off", async () => {
  const url = "https://prices.test/off";
  configure({ pricesUrl: null });
  expect(await modelPrices()).toBeNull();
  configure({ pricesUrl: url });
});

test("caches one fetch of the list and remembers a failure", async () => {
  const realFetch = globalThis.fetch;
  const url = "https://prices.test/list";
  let calls = 0;
  globalThis.fetch = Object.assign(
    (): Promise<Response> => {
      calls += 1;
      return Promise.resolve(Response.json(LIST));
    },
    { preconnect: realFetch.preconnect }
  );
  configure({ pricesUrl: url });
  try {
    const first = await modelPrices();
    const second = await modelPrices();
    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(first?.has("claude-sonnet-5")).toBe(true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("leaves the cost out when the list cannot be read", async () => {
  const realFetch = globalThis.fetch;
  const url = "https://prices.test/down";
  globalThis.fetch = Object.assign(
    (): Promise<Response> => Promise.resolve(new Response("", { status: 503 })),
    { preconnect: realFetch.preconnect }
  );
  configure({ pricesUrl: url });
  try {
    expect(await modelPrices()).toBeNull();
  } finally {
    globalThis.fetch = realFetch;
  }
});
