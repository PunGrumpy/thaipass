import { afterEach, expect, test } from "bun:test";

import { stubUpstream } from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";

import { app } from "../app";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";

let upstream: Upstream;

afterEach(() => {
  upstream?.restore();
});

test("workspace status rejects requests without session cookie", async () => {
  const res = await app.fetch(
    new Request("https://proxy.test/v1/workspace/status")
  );
  expect(res.status).toBe(401);
});

test("workspace launch rejects requests without session cookie", async () => {
  const res = await app.fetch(
    new Request("https://proxy.test/v1/workspace/launch")
  );
  expect(res.status).toBe(401);
});

test("workspace status returns entitlement and console URL", async () => {
  upstream = stubUpstream(
    () => new Response(""),
    (path) => {
      if (path.includes("profile-entitlement")) {
        return Response.json({
          availability: "unavailable",
          entitlement: {
            externalPartner: "gemini_enterprise",
            status: "active",
          },
          ok: true,
        });
      }
    }
  );

  const res = await app.fetch(
    new Request("https://proxy.test/v1/workspace/status", {
      headers: { authorization: `Bearer ${COOKIE}` },
    })
  );
  expect(res.status).toBe(200);
  // SAFETY: Response shape is guaranteed by the workspace status handler.
  const data = (await res.json()) as {
    ok: boolean;
    entitlement: { status: string };
    consoleUrl: string;
  };
  expect(data.ok).toBe(true);
  expect(data.entitlement.status).toBe("active");
  expect(data.consoleUrl).toContain("vertexaisearch.cloud.google");
});
