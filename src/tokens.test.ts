import { expect, test } from "bun:test";

import { addText, charTokens, estimateTokens, newCharCount } from "./tokens";

test("counts four ascii characters to a token", () => {
  expect(estimateTokens("12345678")).toBe(2);
});

test("counts other scripts closer to one character a token", () => {
  expect(estimateTokens("สวัสดี")).toBe(4);
});

test("counts an empty string as nothing", () => {
  expect(estimateTokens("")).toBe(0);
});

test("adds up the pieces of a streamed reply", () => {
  const count = newCharCount();
  addText(count, "abcd");
  addText(count, "efgh");
  expect(charTokens(count)).toBe(estimateTokens("abcdefgh"));
});
