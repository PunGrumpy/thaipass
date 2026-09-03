import { Elysia, status } from "elysia";

import {
  fetchCredits,
  creditBalanceSchema,
  toCreditBalance,
} from "../aipass/quotas";
import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { apiError, apiErrorSchema } from "../openai/errors";

const NO_BALANCE =
  "AI Pass reported no credit balance; the cookie is likely stale";

export const usageRoutes = new Elysia()
  .use(requestLogger)
  .model({ ApiError: apiErrorSchema, CreditBalance: creditBalanceSchema })
  .get(
    "/v1/usage",
    {
      detail: {
        description:
          "The credit balance of the account behind the cookie, as AI Pass meters it: a limit per period, how much of it is used and available, and when the period resets. Every completion also reports this in its usage.credits, so this is for checking the balance without spending any.",
        responses: {
          "200": json("CreditBalance", "The account's credit balance"),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json(
            "ApiError",
            "AI Pass reported no balance, often a stale cookie"
          ),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "Read the credit balance",
        tags: ["Meta"],
      },
      response: { 200: "CreditBalance", 401: "ApiError", 502: "ApiError" },
    },
    async ({ request, log }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, apiError(lookup.reason));
      }
      const { cookie } = lookup;
      log.set({ clientId: clientIdFromCookie(cookie) });
      const credits = await fetchCredits(cookie, request.signal);
      if (!credits) {
        log.set({ status: 502 });
        return status(502, apiError(NO_BALANCE));
      }
      log.set({ ...credits });
      return toCreditBalance(credits);
    }
  );
