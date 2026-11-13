import { expect, test } from "bun:test";

import { cookieHeaderFor, WORKSPACE_ORIGIN } from "./sso";

test("keeps only the cookies the workspace root would receive", () => {
  const header = cookieHeaderFor(
    [
      {
        domain: "vertexaisearch.cloud.google",
        name: "__Host-C_OSES",
        path: "/",
        value: "a",
      },
      { domain: ".cloud.google", name: "NID", path: "/", value: "b" },
      { domain: ".aipass.net", name: "session", path: "/", value: "c" },
      {
        domain: "vertexaisearch.cloud.google",
        name: "scoped",
        path: "/us",
        value: "d",
      },
      {
        domain: "evilvertexaisearch.cloud.google",
        name: "lookalike",
        path: "/",
        value: "e",
      },
    ],
    `${WORKSPACE_ORIGIN}/`
  );
  expect(header).toBe("__Host-C_OSES=a; NID=b");
});
