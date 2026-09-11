import { expect, test } from "bun:test";

import { clientFields } from "./client";

const request = (headers: Record<string, string>): Request =>
  new Request("https://proxy.test/v1/messages", { headers, method: "POST" });

test("names the caller from its own header", () => {
  const fields = clientFields(request({ "x-thaipass-app": " baymi " }));
  expect(fields.app).toBe("baymi");
});

test("leaves the caller unnamed when the header is missing or blank", () => {
  expect(clientFields(request({})).app).toBeUndefined();
  expect(clientFields(request({ "x-thaipass-app": "  " })).app).toBeUndefined();
});

test("caps a long caller name", () => {
  const fields = clientFields(request({ "x-thaipass-app": "a".repeat(200) }));
  expect(fields.app).toHaveLength(64);
});

test("reads the first address of a forwarded chain", () => {
  const fields = clientFields(
    request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" })
  );
  expect(fields.clientIp).toBe("203.0.113.7");
  expect(fields.$ip).toBe("203.0.113.7");
});
