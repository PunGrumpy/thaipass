# AIPass Proxy

An OpenAI-compatible `/v1/chat/completions` proxy in front of the [AI Pass](https://de.aipass.net) chat backend. It lets a personal tool (t3, Codex, any OpenAI client) reach the same models the account already sees in the web UI: Claude Opus 5, GPT-5.6, Gemini 3.x, GLM 5.2, DeepSeek, Grok, and others.

> **Personal use only.** Every request carries the caller's own AI Pass session cookie, so the proxy stores no credential and drives no account but the caller's. It is still not for redistribution or any kind of scale. See [Scope](#scope).

## How it works

AI Pass is a stateful chat app that speaks the Vercel AI SDK v5 UI-message stream behind a browser session cookie. Each proxied request does four things.

1. **Creates a throwaway conversation.** `POST /chat.data`, form-encoded, `intent=create-conversation`. The conversation id is the first 16 hex chars of a client-generated UUID.
2. **Sends one flattened turn.** `POST /actions/send-message/<id>`, JSON. The backend answers from _server-stored_ history and ignores multi-message bodies, so the whole OpenAI conversation (system plus turns) is flattened into a single role-labelled user message. A fresh conversation per request keeps that history empty, so nothing bleeds between requests.
3. **Streams the reply.** The `text-delta` SSE events become OpenAI `chat.completion.chunk`s, or accumulate into one non-streaming response.
4. **Deletes the conversation.** `POST /actions/update-conversation.data` with `intent=delete`, so the account's chat list stays clean.

## Authentication

The proxy holds no credential. Each request must carry the caller's own AI Pass session cookie in the `Authorization` header:

```
Authorization: Bearer <full Cookie header value>
```

The value is the whole `Cookie:` header from a logged-in browser session and must contain `__Secure-ai_passport_auth.session_token`; anything else is rejected with 401. Semicolons and spaces inside it are fine. In an OpenAI client, paste it into the API key field. A client that requires the key to look like `sk-...` will not work.

`GET /v1/models` and `GET /health` need no credential.

## Setup

```bash
bun install
bun run start
```

Configuration is environment only. Bun loads a local `.env` on its own; every value has a default, so no file is required.

| var | default | notes |
| --- | --- | --- |
| `AIPASS_ORIGIN` | `https://de.aipass.net` |  |
| `AIPASS_HOST` | `127.0.0.1` | bind address, local server only |
| `AIPASS_PORT` | `3789` | local server only |
| `POSTHOG_API_KEY` | none | optional, enables the PostHog drain. The project token, `phc_...` |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | optional |

A bad value fails at startup naming the variable, rather than surfacing later as a malformed URL.

## Endpoints

- `POST /v1/chat/completions`, streaming and non-streaming
- `GET /v1/models`, the chat model catalog
- `GET /health`

```bash
curl -sN localhost:3789/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $COOKIE" \
  -d '{"model":"claude-sonnet-5@default","messages":[{"role":"user","content":"hi"}]}'
```

Model ids are case-sensitive and Claude carries a `@provider` suffix (`claude-opus-5@azure`, `claude-sonnet-5@default`). An id outside the catalog is rejected with 400 rather than forwarded. The full list is in [`src/aipass/models.ts`](src/aipass/models.ts). `gemini-3.1-flash-lite` is the free default.

## Using it as an AI SDK provider

The proxy exists for OpenAI clients. An AI SDK app does not need it. `createAipass` returns models that `streamText` and `generateText` accept, and the call reaches AI Pass without an HTTP hop of its own.

```ts
import { streamText } from "ai";
import { createAipass } from "aipass-proxy/provider";

const aipass = createAipass({ cookie: process.env.AIPASS_COOKIE ?? "" });

const result = streamText({
  model: aipass("claude-sonnet-5@default"),
  prompt: "hi",
});
```

`aipass(id)` takes an id from the catalog and autocompletes it. `aipass.languageModel(id)` takes any string, which is what `ProviderV2` asks for and what a model id read from config looks like; an id outside the catalog throws `NoSuchModelError` there.

It calls the same `src/aipass` code the route does: one throwaway conversation per call, the messages flattened into a single turn, a delete on the way out. An upstream answer that is not an event stream throws `APICallError`.

AI Pass reads a model id and messages, nothing else. So `temperature`, `maxOutputTokens`, `seed`, `stopSequences`, `responseFormat`, the penalties, `topP` and `topK` come back as `unsupported-setting` warnings, and tools and `toolChoice` as `unsupported-tool`. The provider drops file parts and tool results and names the types it dropped. `usage` is undefined, for the same reason it is zero over HTTP.

## Deploying

`src/app.ts` builds the Elysia app and starts nothing, so both entry points share it.

- Local: `src/server.ts` calls `.listen()`, which is what `bun run start` and `bun run dev` use.
- Vercel: `src/index.ts` default-exports the app, the entry Vercel's Elysia preset looks for, and `vercel.json` sets `bunVersion` so functions run on Bun. There is no `api/` directory and nothing to rewrite.

Because the deployment stores no credential, a leaked URL leaks nothing. It is still an open relay to AI Pass for anyone holding a valid cookie, so keep Vercel's Deployment Protection on unless you want it reachable.

Two Bun-only settings do not apply on Vercel: `AIPASS_HOST` / `AIPASS_PORT`, and the 240s idle timeout. A long stream is bounded by the platform's function duration instead, so a slow model can be cut off mid-reply.

## Notes

- `usage` on a non-streaming reply is always zeros. AI Pass reports no token counts, and a character-count estimate would look right while being wrong, so a client that meters spend from this field reads 0.
- The cookie is short-lived. When it expires, requests fail with `upstream 3xx ... cookie is stale`. Send a fresh one; nothing on the server needs to change.
- Prompts and cookies never reach the logs. Each request emits one wide event carrying sizes, counts and timings, plus the upstream status, `reasoningChars` for thinking models, and a count of the SSE payloads that failed to decode with the `type` of each one.
- Set `POSTHOG_API_KEY` to the project token from Project Settings, `phc_...`, to forward those events to PostHog as `aipass_proxy_request`. Ingestion authenticates on that token alone, so there is no project id to set; a personal key, `phx_...`, is for reading data back and is rejected at startup. Fields are flat, so `model`, `msToFirstChunk` and `country` arrive as filterable properties rather than one opaque object. Startup lines are not forwarded.
- Callers are identified by IP, user agent, Vercel's geo headers, and `clientId`, a SHA-256 prefix of the cookie that groups one session without revealing it. IPv4 redaction is off so the address survives; emails, JWTs, bearer tokens, cards, phones and IBANs are still masked.
- `userId`, `userName`, `userTier` and `userTierExp` come from `GET /lms/api/v1/session/session-tier`, cached five minutes per caller. `userId` is the PostHog distinct id, because `clientId` changes every time the cookie rotates and would split one person into a new profile each time. The account email is read and thrown away rather than logged, and the cookie itself never leaves the process. When the lookup fails the fields are absent and evlog marks the event `$process_person_profile: false`, so a failed lookup produces an anonymous event instead of a wrong person.
- `modelFree` and `modelReady` come from the upstream catalog, cached five minutes per caller. When that catalog lists a model the proxy does not serve, a warning names it, so a stale `CHAT_MODELS` shows up in the logs instead of as a 400 nobody can explain.
- Every event also carries the caller's AI Pass credit balance: `creditsUsed`, `creditsAvailable`, `creditsLimit` and `creditsResetAt`. The daily allowance is 10000 and resets at `creditsResetAt`, so a burn-down chart falls out of `creditsAvailable` over time. That costs one extra `GET /loaders/get-usage-quota`, started in parallel with the chat request and awaited only before the event is written, so it never delays a reply.

## Layout

The proxy is an adapter between two wire formats, so the two sides live apart and only meet in `src/translate.ts`.

```
src/app.ts       the Elysia app, error mapping, body parsing, route mounting
src/index.ts     Vercel entry, default-exports the app
src/server.ts    local Bun server
src/routes/      one module per endpoint
src/aipass/      upstream: client, session cookie, model catalog, quotas, SSE stream
src/openai/      wire format: request schema, chunk and completion shapes, error shape
src/provider/    LanguageModelV2 implementation, for AI SDK callers
src/translate.ts flattens an OpenAI conversation into the single turn AI Pass reads
src/lib/         env, config, logging, client info, stream guards
src/testing/     helpers shared between test files
```

`src/openai/schema.ts` is the one file that reaches across, for the model enum: the proxy only accepts models AI Pass serves.

## Scripts

- `bun run dev`, watch mode
- `bun run test`, Bun test suite
- `bun run check`, Ultracite (oxlint + oxfmt) check
- `bun run fix`, format and autofix
- `bun run typecheck`, `tsc --noEmit`

## Scope

This is a reverse-engineered adapter over an undocumented private API. Keep it to a single account you own, for your own use. Don't publish it as a service, point it at accounts that aren't yours, or run it at a scale that would burden the shared program. Asking other people for their session cookie means asking them to trust you with full access to their account, which is a good reason not to.
