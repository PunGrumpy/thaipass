import { expect, test } from "bun:test";

import {
  EDGE_REFUSAL_CLIENT_STATUS,
  isEdgeRefusal,
  refusalDetail,
  refusedPatternsIn,
  wantsWithholding,
  WITHHELD_MARKER,
  withholdRefused,
} from "./refusal";

test("only a 403 is an edge refusal", () => {
  expect(isEdgeRefusal(403)).toBe(true);
  expect(isEdgeRefusal(429)).toBe(false);
  expect(isEdgeRefusal(500)).toBe(false);
  expect(EDGE_REFUSAL_CLIENT_STATUS).toBe(400);
});

test("names the known strings a prompt carries", () => {
  expect(refusedPatternsIn("assign to document.cookie here")).toEqual([
    "document.cookie",
  ]);
  expect(refusedPatternsIn("do not use eval() or document.write")).toEqual([
    "document.write",
    "eval()",
  ]);
});

test("a prompt with none of them names none", () => {
  expect(refusedPatternsIn("dangerouslySetInnerHTML and a cookie jar")).toEqual(
    []
  );
  expect(refusalDetail([])).toBe("");
});

test("the detail lists what was found", () => {
  expect(refusalDetail(["document.cookie"])).toContain("document.cookie");
});

test("withholding replaces each occurrence and counts them", () => {
  const held = withholdRefused("a document.cookie and document.cookie again");
  expect(held.withheld).toBe(2);
  expect(held.text).not.toContain("document.cookie");
  expect(held.text.split(WITHHELD_MARKER)).toHaveLength(3);
});

test("withholding leaves clean text and its length alone", () => {
  const held = withholdRefused("nothing here trips the edge");
  expect(held.withheld).toBe(0);
  expect(held.text).toBe("nothing here trips the edge");
});

test("withholding covers every known string in one pass", () => {
  const held = withholdRefused(
    "eval() then document.write then document.cookie"
  );
  expect(held.withheld).toBe(3);
  expect(refusedPatternsIn(held.text)).toEqual([]);
});

test("withholding is off unless the header asks for it", () => {
  expect(wantsWithholding(new Headers())).toBe(false);
  expect(wantsWithholding(new Headers({ "x-thaipass-withhold": "0" }))).toBe(
    false
  );
  expect(wantsWithholding(new Headers({ "x-thaipass-withhold": "1" }))).toBe(
    true
  );
});
