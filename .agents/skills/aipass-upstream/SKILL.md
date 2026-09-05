---
name: aipass-upstream
description: Keep the proxy in sync with the AI Pass upstream — refresh the known model list in src/aipass/models.ts when CHAT_MODELS or MEDIA_MODELS drifts from /loaders/list-models, and capture or verify a fresh session cookie. Use on "catalog has unserved models" warnings, "unknown model" 400s, "no model catalog" or "cookie is stale, re-auth needed" 502s, 401s from the proxy, or when a model works in the AI Pass web UI but not through the proxy.
metadata:
  author: PunGrumpy
  version: "0.1"
---

# AI Pass upstream sync

Two chores this proxy needs on a schedule set by the upstream, not by the code: the model catalog moves, and the session cookie expires. Everything else about the adapter is in `README.md`; read that for the wire format and the request lifecycle.

## When to use

- A log line says `catalog has unserved models` — upstream lists a model the proxy has not met. A chat id still works, because the proxy checks chat requests against the account's catalog. The proxy treats an image, video or music id as chat until `MEDIA_MODELS` names it, so it reaches the wrong route.
- A request comes back `400 unknown model ... the account's catalog does not list it` for a model the web UI shows — the catalog and the web UI disagree, or the cookie belongs to another account.
- A request comes back `400 unknown model ..., see GET /v1/models` without the catalog clause, or `GET /v1/models` answers `502 ... no model catalog` — the proxy could not read the catalog and fell back to the built-in list. Check the cookie first.
- A request comes back `502 upstream 3xx ...; cookie is stale, re-auth needed`, or `401 missing AI Pass session cookie`.
- The wide event lands with no `modelFree` / `modelReady` / `creditsAvailable` — the loader calls quietly failed, which almost always means the cookie died.

## 1. Get a working cookie

The proxy stores no credential; every request carries the caller's own cookie. Ask the user for it — never try to log in on their behalf.

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

`200` means live. **`401` means dead** — the loader endpoints answer 401, not a redirect. The `sign-in` 3xx that produces the `cookie is stale` hint comes from the chat _action_ path (`src/routes/chat.ts:70`), so the two symptoms look different depending on which call noticed first.

In fish, set it with `set -x COOKIE '<the whole cookie header>'`. Keep it out of tracked files; nothing in the repo reads a cookie from disk or from the environment, and `.env` has no slot for one.

## 2. Refresh the model catalog

`GET /v1/models` lists the account's catalog from `/loaders/list-models`, and the proxy checks chat requests against the same catalog. A new chat model therefore needs no change here. `CHAT_MODELS` in `src/aipass/models.ts` has four jobs: the fallback when the catalog cannot be read, the examples in the OpenAPI document, the `/health` count, and one half of the drift warning. `MEDIA_MODELS` matters more. It is how the proxy knows an id makes an image, a video or a clip, which the catalog does not say. The video options per model live in `src/aipass/video.ts`.

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

1. **added** — put chat ids in `CHAT_MODELS` and image, video or music ids in the matching list behind `MEDIA_MODELS`. A video id also needs its options in `src/aipass/video.ts`. Leave a media id out and the proxy serves it as chat, which fails at the wrong route. Ids are case-sensitive and Claude carries a `@provider` suffix — copy them verbatim.
2. **gone** — the catalog already answers 400 for a retired id, so removing it here only changes the fallback and the docs. Never remove `DEFAULT_MODEL`.
3. `DEFAULT_MODEL` must stay in `CHAT_MODELS` and should stay on the **free** list, so an unspecified model costs nothing.
4. `bun run typecheck && bun run check`.

Nothing else needs touching: `served` in `src/aipass/catalog.ts` is built from both arrays, and the warning goes quiet on its own.

## Upstream endpoints

| path | method | used by | notes |
| --- | --- | --- | --- |
| `/loaders/list-models` | GET | `src/aipass/catalog.ts` | cached 5 min per caller |
| `/loaders/get-usage-quota` | GET | `src/aipass/quotas.ts` | credits, scaled by `creditsDecimals` |
| `/chat.data` | POST form | `src/aipass/client.ts` | `intent=create-conversation` |
| `/actions/send-message/<id>` | POST json | `src/aipass/client.ts` | answers with the AI SDK v5 SSE stream |
| `/actions/update-conversation.data` | POST form | `src/aipass/client.ts` | `intent=delete` |

Both loaders go through `loadJson`, which **swallows every failure and returns `null`** (`src/aipass/request.ts:43`). A dead cookie therefore shows up as missing fields on the wide event rather than as an error — check the cookie first when catalog or credit fields go absent.

### LMS endpoints

The learning site at `/lms` is a separate Next.js app; its backend answers on the same origin under `/lms/api/v1`, with the same session cookie plus an `X-CSRF-Protection: 1` header. `src/lms/api.ts` holds the routes and `src/lms/learn.ts` the lesson-page sequence. Mapped from the client bundle (`3vvnepg1owi5i.js` is the generated API layer), not a spec; the stamp field names were read off a live lesson's `videoContent`, which echoes them back.

| path | method | notes |
| --- | --- | --- |
| `/course/v2` | POST json | catalogue, `{page, limit}` |
| `/course/<code>/lesson` | GET | lessons with `lessonVersionId`, `lessonType`, `enrollmentId` |
| `/course/<code>/enrollment` | POST | enrol |
| `/course/<code>/lesson/<lessonVersionId>` | POST json | open, `{enrollmentId}`; answers `durationSeconds`, `lessonProgressId`, `videoContent`; 403 inside a 200 when not enrolled |
| `.../video-stamp` | PUT json | `{currentSeconds, watchedSeconds}`, the names `videoContent` echoes back |
| `.../lesson-completed`, `.../course-completed` | PUT json | close the lesson (`{watchedSeconds}`), the course (`{}`, unverified) |
| `/session/session-exp`, `/session/session-tier` | GET | `member.expEarn` is the period's EXP as a string; the tier carries `member.lessonTypeExp[]` |
| `/achievement` | GET | the achievements page |

A `401` with `No authentication credentials provided` means no session token reached the LMS; `Authentication service error` means one did and was refused.

## Scope

This is a reverse-engineered adapter over an undocumented private API for one account the user owns. Poll these endpoints by hand when something looks wrong, not on a timer, and never against an account that is not the caller's.
