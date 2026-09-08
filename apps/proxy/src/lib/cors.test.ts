import { expect, test } from "bun:test";

import { app } from "../app";

const DASHBOARD = "http://localhost:3000";

const get = (origin?: string): Request =>
  new Request("https://proxy.test/health", {
    headers: origin === undefined ? {} : { origin },
  });

const preflight = (origin: string): Request =>
  new Request("https://proxy.test/v1/usage", {
    headers: {
      "access-control-request-headers": "authorization",
      "access-control-request-method": "GET",
      origin,
    },
    method: "OPTIONS",
  });

test("answers a preflight from a loopback origin", async () => {
  const response = await app.fetch(preflight(DASHBOARD));
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(DASHBOARD);
  expect(response.headers.get("access-control-allow-headers")).toContain(
    "authorization"
  );
});

test("puts the allow-origin header on a normal response", async () => {
  const response = await app.fetch(get(DASHBOARD));
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe(DASHBOARD);
  expect(response.headers.get("vary")).toBe("origin");
});

test("leaves an off-host origin without cors headers", async () => {
  const response = await app.fetch(get("https://evil.example"));
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

test("leaves a request with no origin alone", async () => {
  const response = await app.fetch(get());
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});
