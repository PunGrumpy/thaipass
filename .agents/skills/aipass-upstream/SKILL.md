---
name: aipass-upstream
description: Keep the proxy in sync with the AI Pass upstream — refresh the model catalog in src/aipass/models.ts when CHAT_MODELS drifts from /loaders/list-models, and capture or verify a fresh session cookie. Use on "catalog has unserved models" warnings, "unknown model, see GET /v1/models" 400s, "cookie is stale, re-auth needed" 502s, 401s from the proxy, or when a model works in the AI Pass web UI but not through the proxy.
metadata:
  author: PunGrumpy
  version: '0.1'
---

# AI Pass upstream sync

Two chores this proxy needs on a schedule set by the upstream, not by the code: the
model catalog moves, and the session cookie expires. Everything else about the
adapter is in `README.md`; read that for the wire format and the request lifecycle.

## When to use

- A log line says `catalog has unserved models` — upstream lists a model the proxy refuses.
- A request comes back `400 unknown model, see GET /v1/models` for a model the web UI shows.
- A request comes back `502 upstream 3xx ...; cookie is stale, re-auth needed`, or `401 missing AI Pass session cookie`.
- The wide event lands with no `modelFree` / `modelReady` / `creditsAvailable` — the loader calls quietly failed, which almost always means the cookie died.

## 1. Get a working cookie

The proxy stores no credential; every request carries the caller's own cookie. Ask
the user for it — never try to log in on their behalf.

1. Sign in to `https://de.aipass.net` in a browser.
2. DevTools → Network → click any request to `de.aipass.net` → Request Headers → copy the **entire** `Cookie:` value. (Application → Cookies works too, but you must reassemble the whole header.)
3. The value must contain `__Secure-ai_passport_auth.session_token`, or `cookieFromRequest` rejects it with 401 before anything reaches upstream (`src/aipass/session.ts:15`).
4. Send it whole as `Authorization: Bearer <cookie>`. Semicolons and spaces inside it are fine.

Verify it without spending credits — this is a read-only loader call:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "cookie: $COOKIE" \
  -H 'referer: https://de.aipass.net/chat' \
  -H 'user-agent: Mozilla/5.0' \
  https://de.aipass.net/loaders/get-usage-quota
```

`200` means live. **`401` means dead** — the loader endpoints answer 401, not a
redirect. The `sign-in` 3xx that produces the `cookie is stale` hint comes from the
chat _action_ path (`src/routes/chat.ts:70`), so the two symptoms look different
depending on which call noticed first.

In fish, set it with `set -x COOKIE '<the whole cookie header>'`. Keep it out of
tracked files; nothing in the repo reads a cookie from disk or from the environment,
and `.env` has no slot for one.

## 2. Refresh the model catalog

`CHAT_MODELS` in `src/aipass/models.ts` is the single source of truth. `chatModelSchema`,
the `/v1/models` route and the drift warning all derive from it, so a catalog refresh
touches exactly one array — resist the urge to hunt for a second list.

Diff upstream against what the proxy serves:

```bash
bun -e '
import { CHAT_MODELS, MEDIA_MODELS } from "./src/aipass/models";
const res = await fetch("https://de.aipass.net/loaders/list-models", {
  headers: { cookie: process.env.COOKIE ?? "", referer: "https://de.aipass.net/chat", "user-agent": "Mozilla/5.0" },
  redirect: "manual",
});
if (!res.ok) {
  console.error(`upstream ${res.status} — cookie is probably dead`);
  process.exit(1);
}
const { data } = await res.json();
const served = new Set([...CHAT_MODELS, ...MEDIA_MODELS]);
const upstream = new Map(data.map((m) => [m.id, m]));
console.log("added upstream :", [...upstream.keys()].filter((id) => !served.has(id)));
console.log("gone upstream  :", [...served].filter((id) => !upstream.has(id)));
console.log("free           :", data.filter((m) => m.isFreeCredit).map((m) => m.id));
console.log("not ready      :", data.filter((m) => m.ready === false).map((m) => m.id));
'
```

Then:

1. **added** — put chat ids in `CHAT_MODELS`, image/video/audio ids in `MEDIA_MODELS`.
   `MEDIA_MODELS` exists only to silence the drift warning; the proxy serves chat.
   Ids are case-sensitive and Claude carries a `@provider` suffix — copy them verbatim.
2. **gone** — removing an id turns it into a 400 for anyone still asking. Prefer leaving
   it until upstream has clearly retired it, and never remove `DEFAULT_MODEL`.
3. `DEFAULT_MODEL` must stay in `CHAT_MODELS` and should stay on the **free** list, so
   an unspecified model costs nothing.
4. `bun run typecheck && bun run check`.

Nothing else needs touching: `served` in `src/aipass/catalog.ts` is built from both
arrays, and the warning goes quiet on its own.

## Upstream endpoints

| path                                | method    | used by                 | notes                                 |
| ----------------------------------- | --------- | ----------------------- | ------------------------------------- |
| `/loaders/list-models`              | GET       | `src/aipass/catalog.ts` | cached 5 min per caller               |
| `/loaders/get-usage-quota`          | GET       | `src/aipass/quotas.ts`  | credits, scaled by `creditsDecimals`  |
| `/chat.data`                        | POST form | `src/aipass/client.ts`  | `intent=create-conversation`          |
| `/actions/send-message/<id>`        | POST json | `src/aipass/client.ts`  | answers with the AI SDK v5 SSE stream |
| `/actions/update-conversation.data` | POST form | `src/aipass/client.ts`  | `intent=delete`                       |

Both loaders go through `loadJson`, which **swallows every failure and returns `null`**
(`src/aipass/request.ts:43`). A dead cookie therefore shows up as missing fields on
the wide event rather than as an error — check the cookie first when catalog or
credit fields go absent.

## Scope

This is a reverse-engineered adapter over an undocumented private API for one account
the user owns. Poll these endpoints by hand when something looks wrong, not on a
timer, and never against an account that is not the caller's.
