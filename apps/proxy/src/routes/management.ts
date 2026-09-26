import { fetchIdentity } from "@thaipass/core/aipass/identity";
import { fetchCredits } from "@thaipass/core/aipass/quotas";
import {
  clientIdFromCookie,
  cookieFromRequest,
} from "@thaipass/core/aipass/session";
import { Elysia, status } from "elysia";
import { z } from "zod";

import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { apiError, apiErrorSchema } from "../openai/errors";
import { creditWindow, PERIOD_MINUTES } from "../openai/responses/rate-limits";

/**
 * The slice of the CLIProxyAPI management API that T3 Code reads when Thaipass
 * is added under Settings, Usage limit sources. T3 Code cannot read limits from
 * a Codex that is not signed in to ChatGPT, so this is how the balance reaches
 * its Limits view. The one account listed is the one behind the cookie.
 */

const AUTH_INDEX = "0";
const USAGE_PATH = "/backend-api/wham/usage";
// T3 Code labels the account from plan_type and publishes a snapshot that
// fails to decode when the label is missing, so name the one plan it maps
// without claiming a ChatGPT tier.
const PLAN_TYPE = "unknown";
const SECONDS_PER_MINUTE = 60;
const NOT_SERVED = 404;
const NO_BALANCE_STATUS = 502;
const NO_BALANCE =
  "AI Pass reported no credit balance; the cookie is likely stale";

const authFilesSchema = z.object({
  files: z.array(
    z.object({
      auth_index: z.string(),
      email: z.string().optional(),
      id: z.string(),
      provider: z.literal("codex"),
    })
  ),
});

const apiCallRequestSchema = z.object({
  auth_index: z.string(),
  method: z.string(),
  url: z.string(),
});

const apiCallSchema = z.object({
  body: z.string(),
  status_code: z.number().int(),
});

type ApiCall = z.infer<typeof apiCallSchema>;

const isUsageUrl = (raw: string): boolean => {
  try {
    return new URL(raw).pathname === USAGE_PATH;
  } catch {
    return false;
  }
};

const refused = (statusCode: number, message: string): ApiCall => ({
  body: JSON.stringify(apiError(message)),
  status_code: statusCode,
});

export const managementRoutes = new Elysia()
  .use(requestLogger)
  .model({
    ApiCall: apiCallSchema,
    ApiCallRequest: apiCallRequestSchema,
    ApiError: apiErrorSchema,
    AuthFiles: authFilesSchema,
  })
  .get(
    "/v0/management/auth-files",
    {
      detail: {
        description:
          "Lists the account behind the cookie as a Codex account, in the shape the CLIProxyAPI management API uses. T3 Code calls it when Thaipass is added as a usage limit source, with the cookie as the management key.",
        responses: {
          "200": json("AuthFiles", "The one account the cookie signs in to"),
          "401": json("ApiError", "Missing or malformed session cookie"),
        },
        security: [{ aipassCookie: [] }],
        summary: "List accounts for T3 Code",
        tags: ["Meta"],
      },
      response: { 200: "AuthFiles", 401: "ApiError" },
    },
    async ({ request, log }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, apiError(lookup.reason));
      }
      const { cookie } = lookup;
      const clientId = clientIdFromCookie(cookie);
      log.set({ clientId });
      const identity = await fetchIdentity(clientId, cookie, request.signal);
      return {
        files: [
          {
            auth_index: AUTH_INDEX,
            ...(identity?.userEmail && { email: identity.userEmail }),
            id: clientId,
            provider: "codex" as const,
          },
        ],
      };
    }
  )
  .post(
    "/v0/management/api-call",
    {
      body: "ApiCallRequest",
      detail: {
        description:
          "Answers the one upstream call T3 Code routes through a CLIProxyAPI hub to read Codex limits, GET https://chatgpt.com/backend-api/wham/usage, with the AI Pass credit balance as a daily window. The proxy never forwards the call, and answers any other URL with a status_code of 404.",
        responses: {
          "200": json("ApiCall", "What the call would have returned"),
          "401": json("ApiError", "Missing or malformed session cookie"),
        },
        security: [{ aipassCookie: [] }],
        summary: "Read usage for T3 Code",
        tags: ["Meta"],
      },
      parse: "json",
      response: { 200: "ApiCall", 401: "ApiError" },
    },
    async ({ body, request, log }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, apiError(lookup.reason));
      }
      const { cookie } = lookup;
      log.set({ clientId: clientIdFromCookie(cookie), hubUrl: body.url });
      if (body.method !== "GET" || !isUsageUrl(body.url)) {
        return refused(NOT_SERVED, `the proxy does not serve ${body.url}`);
      }
      const credits = await fetchCredits(cookie, request.signal);
      const window = credits ? creditWindow(credits) : null;
      if (window?.usedPercent === undefined) {
        log.set({ hubStatus: NO_BALANCE_STATUS });
        return refused(NO_BALANCE_STATUS, NO_BALANCE);
      }
      log.set({ ...credits });
      return {
        body: JSON.stringify({
          plan_type: PLAN_TYPE,
          rate_limit: {
            primary_window: {
              limit_window_seconds: PERIOD_MINUTES * SECONDS_PER_MINUTE,
              reset_at: window.resetAt ?? null,
              used_percent: window.usedPercent,
            },
          },
        }),
        status_code: 200,
      };
    }
  );
