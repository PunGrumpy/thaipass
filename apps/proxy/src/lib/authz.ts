import { cookieFromRequest } from "@thaipass/core/aipass/session";
import { Elysia, status } from "elysia";
import { log } from "evlog";

import type { AnthropicError } from "../anthropic/errors";
import type { ApiError } from "../openai/errors";
import { missingScope } from "./scopes";

/**
 * The one place a thaipass token is held to what it was granted.
 *
 * Scope is checked before routing rather than inside each route, because a
 * route that forgets the check is a route that hands an app the whole account.
 * A raw cookie carries no grant and is unscoped by definition: whoever sends
 * one is the account holder.
 */

export type ErrorBody = (
  path: string,
  code: number,
  message: string
) => AnthropicError | ApiError;

const FORBIDDEN = 403;

export const scopeGuard = (errorBody: ErrorBody) =>
  new Elysia({ name: "scope-guard" }).request(({ request }) => {
    const { pathname } = new URL(request.url);
    const lookup = cookieFromRequest(request);
    if (!lookup.ok) {
      // Routes answer for themselves: a missing credential is a 401 with the
      // wording of whichever protocol was being spoken.
      return;
    }
    const missing = missingScope(lookup.grant, pathname);
    if (missing === null) {
      return;
    }
    const message = `this thaipass token was not granted the ${missing} scope; sign in again and approve it`;
    log.warn({
      grantClient: lookup.grant?.clientId,
      grantScope: lookup.grant?.scope,
      msg: message,
      path: pathname,
      status: FORBIDDEN,
    });
    return status(FORBIDDEN, errorBody(pathname, FORBIDDEN, message));
  });
