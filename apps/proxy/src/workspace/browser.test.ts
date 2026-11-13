import { expect, test } from "bun:test";

import { browserEndpoint } from "./browser";

const request = (headers: Record<string, string> = {}): Request =>
  new Request("https://proxy.test/v1/chat/completions", { headers });

test("turns a bare key into a Browserless endpoint", () => {
  expect(browserEndpoint(request({ "x-browser-token": "abc123" }))).toBe(
    "wss://production-sfo.browserless.io?token=abc123"
  );
});

test("encodes a key that is not URL safe", () => {
  expect(browserEndpoint(request({ "x-browser-token": " a b&c " }))).toBe(
    "wss://production-sfo.browserless.io?token=a%20b%26c"
  );
});

test("uses a caller's wss URL as it was sent", () => {
  expect(
    browserEndpoint(request({ "x-browser-token": "wss://chrome.test/?k=1" }))
  ).toBe("wss://chrome.test/?k=1");
});

test("never lets a caller point the host at a plain ws endpoint", () => {
  expect(
    browserEndpoint(request({ "x-browser-token": "ws://localhost:9222" }))
  ).toBe(
    "wss://production-sfo.browserless.io?token=ws%3A%2F%2Flocalhost%3A9222"
  );
});

test("lets the host's own setting name a local ws browser", () => {
  expect(browserEndpoint(request(), "ws://127.0.0.1:9333")).toBe(
    "ws://127.0.0.1:9333"
  );
});

test("falls back to the host's setting when the header is absent", () => {
  expect(browserEndpoint(request(), "hostkey")).toBe(
    "wss://production-sfo.browserless.io?token=hostkey"
  );
});

test("prefers the caller's own browser over the host's setting", () => {
  expect(
    browserEndpoint(request({ "x-browser-token": "mine" }), "hostkey")
  ).toBe("wss://production-sfo.browserless.io?token=mine");
});

test("finds no browser when neither is set", () => {
  expect(browserEndpoint(request())).toBeNull();
  expect(browserEndpoint(request({ "x-browser-token": "  " }), "")).toBeNull();
});
