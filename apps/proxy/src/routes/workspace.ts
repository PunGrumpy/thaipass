import { cookieFromRequest } from "@thaipass/core/aipass/session";
import { config } from "@thaipass/core/lib/config";
import { Elysia, status } from "elysia";
import { z } from "zod";

import { apiError } from "../openai/errors";

const entitlementPayloadSchema = z.object({
  activation: z.unknown().optional(),
  availability: z.string().optional(),
  entitlement: z.unknown().optional(),
  settings: z.unknown().optional(),
});

const handoffPayloadSchema = z.object({
  appUrl: z.string().optional(),
  handoff: z.unknown().optional(),
  ok: z.boolean().optional(),
});

export const workspaceRoutes = new Elysia({ prefix: "/v1/workspace" })
  .get("/status", async ({ request }) => {
    const lookup = cookieFromRequest(request);
    if (!lookup.ok) {
      return status(401, apiError(lookup.reason));
    }
    const res = await fetch(
      `${config.origin}/loaders/profile-entitlement?externalPartner=gemini_enterprise`,
      {
        headers: {
          cookie: lookup.cookie,
          referer: `${config.origin}/settings/profile`,
          "user-agent": "Mozilla/5.0",
        },
      }
    );
    if (!res.ok) {
      return status(502, apiError(`upstream error: ${res.status}`));
    }
    const raw: unknown = await res.json();
    const data = entitlementPayloadSchema.parse(raw);
    return {
      activation: data.activation ?? null,
      availability: data.availability ?? "unknown",
      consoleUrl:
        "https://vertexaisearch.cloud.google/us/home/cid/3c0d3b0e-1de2-4577-bcea-16b67f1f289e",
      entitlement: data.entitlement ?? null,
      launchUrl: `${config.origin}/ge/open`,
      ok: true,
      settings: data.settings ?? null,
    };
  })
  .get("/launch", async ({ request }) => {
    const lookup = cookieFromRequest(request);
    if (!lookup.ok) {
      return status(401, apiError(lookup.reason));
    }
    const res = await fetch(`${config.origin}/actions/ge-academy-handoff`, {
      headers: {
        cookie: lookup.cookie,
        referer: `${config.origin}/settings/profile`,
        "user-agent": "Mozilla/5.0",
      },
      method: "POST",
    });
    if (!res.ok) {
      return status(502, apiError(`failed to get launch url: ${res.status}`));
    }
    const raw: unknown = await res.json();
    const data = handoffPayloadSchema.parse(raw);
    return {
      appUrl:
        data.appUrl ??
        "https://auth.cloud.google/signin/locations/global/workforcePools/aip-prd-citizens/providers/aipass?continueUrl=https%3A%2F%2Fvertexaisearch.cloud.google%2Fus%2Fhome%2Fcid%2F3c0d3b0e-1de2-4577-bcea-16b67f1f289e",
      ok: true,
    };
  });
