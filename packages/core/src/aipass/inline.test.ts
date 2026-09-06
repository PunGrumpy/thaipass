import { expect, test } from "bun:test";

import { fromDataUri, InlineError, nameFor } from "./inline";

test("decodes a base64 data uri into bytes", () => {
  const attachment = fromDataUri("data:image/png;base64,aGk=");
  expect(attachment.mediaType).toBe("image/png");
  expect([...attachment.bytes]).toEqual([104, 105]);
});

test("decodes a percent-encoded data uri, which small text files arrive as", () => {
  const attachment = fromDataUri("data:text/plain,hello%20there");
  expect(new TextDecoder().decode(attachment.bytes)).toBe("hello there");
});

test("names a file the caller did not name, from what it turned out to be", () => {
  expect(fromDataUri("data:image/jpeg;base64,aGk=").filename).toBe(
    "image-1.jpg"
  );
  expect(
    fromDataUri("data:application/pdf;base64,aGk=", undefined, 2).filename
  ).toBe("attachment-3.pdf");
});

test("keeps the name the caller gave", () => {
  expect(fromDataUri("data:image/png;base64,aGk=", "shot.png").filename).toBe(
    "shot.png"
  );
});

test("refuses a url instead of fetching it", () => {
  expect(() => fromDataUri("https://evil.test/x.png")).toThrow(InlineError);
});

test("refuses base64 it cannot read rather than sending rubbish", () => {
  expect(() => fromDataUri("data:image/png;base64,!!!!")).toThrow(InlineError);
});

test("falls back to a generic type for a data uri that declares none", () => {
  expect(nameFor("", 0)).toBe("attachment-1.bin");
});
