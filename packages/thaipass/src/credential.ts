import { cookieFromValue } from "@thaipass/core/aipass/session";
import { isSealed, issuesTokens } from "@thaipass/core/auth/seal";

/**
 * What `createAipass` will actually send upstream.
 *
 * `thaipass login` hands people a `tp_…` token now, so one will be pasted in
 * here sooner or later. The provider is not a gateway — it talks to AI Pass
 * directly — so a token is only usable in a process that also holds the key
 * that sealed it. When it does, the token opens; when it does not, saying so
 * beats letting AI Pass refuse the request for reasons of its own.
 */

const NO_KEY =
  "that is a thaipass token, and this provider talks to AI Pass directly. Give it the Cookie header, or set THAIPASS_TOKEN_KEY to the key that sealed the token.";

export const resolveCredential = (value: string): string => {
  const lookup = cookieFromValue(value);
  if (lookup.ok) {
    return lookup.cookie;
  }
  throw new Error(isSealed(value) && !issuesTokens() ? NO_KEY : lookup.reason);
};
