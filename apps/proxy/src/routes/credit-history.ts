import {
  fromTuple,
  historyResponseSchema,
  sampleFromCredits,
  thin,
  toTuple,
} from "@thaipass/core/aipass/history";
import { fetchIdentity } from "@thaipass/core/aipass/identity";
import { fetchCredits } from "@thaipass/core/aipass/quotas";
import {
  clientIdFromCookie,
  cookieFromRequest,
} from "@thaipass/core/aipass/session";
import { Elysia, status } from "elysia";

import { history as defaultHistory } from "../lib/history";
import type { History, Stored } from "../lib/history";
import { requestLogger } from "../lib/logger";
import { json } from "../lib/openapi";
import { apiError, apiErrorSchema } from "../openai/errors";

const NO_BALANCE =
  "AI Pass reported no credit balance; the cookie is likely stale";
const NO_RESET =
  "AI Pass reported a credit balance with no readable reset time";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days of history one read returns. Not a query parameter: the page shows one
 * range, and a knob here is a knob every caller would have to understand.
 */
export const RANGE_DAYS = 7;

const NOTHING_STORED: Stored = { samples: [], store: "off" };

/**
 * GET /v1/usage/history. It sits under `/v1/usage`, so `scopeGuard` already
 * holds a token to the `usage` scope. Accepts a raw cookie or a `tp_v1_` token.
 *
 * It reads only the series of the account behind the credential, so the
 * credential is the access control and there is nothing else to configure.
 * The live balance it fetches is recorded too, which is what keeps the series
 * fresh while the dashboard polls.
 */
export const creditHistoryRoutes = (history: History = defaultHistory) =>
  new Elysia()
    .use(requestLogger)
    .model({
      ApiError: apiErrorSchema,
      CreditHistory: historyResponseSchema,
    })
    .get(
      "/v1/usage/history",
      {
        detail: {
          description: `The recorded credit balances of the account behind the cookie for the last ${RANGE_DAYS} days, plus the live balance. Each row is [at, used, limit, resetsAt, model, app, credits], the last three set when the row closed a completion. \`store\` is \`off\` when this deployment has no Redis, and \`down\` when it could not be reached; \`samples\` is then empty.`,
          responses: {
            "200": json(
              "CreditHistory",
              "Recorded samples and the live balance"
            ),
            "401": json("ApiError", "Missing or malformed session cookie"),
            "502": json(
              "ApiError",
              "AI Pass reported no balance, often a stale cookie"
            ),
          },
          security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
          summary: "Read the credit history",
          tags: ["Meta"],
        },
        response: { 200: "CreditHistory", 401: "ApiError", 502: "ApiError" },
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
        const [credits, identity] = await Promise.all([
          fetchCredits(cookie, request.signal),
          history.enabled
            ? fetchIdentity(clientId, cookie, request.signal)
            : null,
        ]);
        if (!credits) {
          log.set({ status: 502 });
          return status(502, apiError(NO_BALANCE));
        }
        const now = Date.now();
        const live = sampleFromCredits(credits, now);
        if (!live) {
          log.set({ status: 502 });
          return status(502, apiError(NO_RESET));
        }
        let stored = NOTHING_STORED;
        if (history.enabled) {
          const range = { from: now - RANGE_DAYS * MS_PER_DAY, to: now };
          const [read] = await Promise.all([
            identity
              ? history.read(identity, range)
              : { samples: [], store: "down" as const },
            history.record(() => identity, { credits }),
          ]);
          stored = read;
        }
        const samples = thin(stored.samples.map(fromTuple), now);
        log.set({
          ...credits,
          historySamples: samples.length,
          historyStore: stored.store,
        });
        return {
          live: toTuple(live),
          samples: samples.map(toTuple),
          store: stored.store,
        };
      }
    );
