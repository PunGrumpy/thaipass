# AIPass Proxy

[![runtime](https://img.shields.io/badge/runtime-bun-000000?style=flat&colorA=000000&colorB=000000)](https://bun.sh) [![framework](https://img.shields.io/badge/framework-elysia-000000?style=flat&colorA=000000&colorB=000000)](https://elysiajs.com) [![deploy](https://img.shields.io/badge/deploy-vercel-000000?style=flat&colorA=000000&colorB=000000)](https://vercel.com)

Point your OpenAI or Anthropic client at AI Pass.

AIPass Proxy serves an OpenAI-compatible `/v1/chat/completions` and an Anthropic-compatible `/v1/messages` in front of the [AI Pass](https://de.aipass.net) chat backend. Any tool that speaks either protocol reaches the models your account already sees in the web UI. AI SDK apps can import the bundled provider instead.

Every request carries your own session cookie. The proxy stores no credential and drives no account but yours. See [Personal use only](#personal-use-only).

## Quick start

### 1. Run the proxy

```bash
bun install
bun run start
```

The server listens on `http://127.0.0.1:3789`. Every setting has a default, so no `.env` is required.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AIPASS_ORIGIN` | `https://de.aipass.net` | Upstream origin |
| `AIPASS_HOST` | `127.0.0.1` | Bind address, local only |
| `AIPASS_PORT` | `3789` | Port, local only |
| `POSTHOG_API_KEY` | none | Project token (`phc_…`), enables PostHog |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog ingestion host |

### 2. Copy your session cookie

Log in to AI Pass and copy the full `Cookie` header from any request to `de.aipass.net`. It must contain `__Secure-ai_passport_auth.session_token`. Keep the percent-encoding as the browser sends it.

That string is your API key. Pass it as a bearer token, or as `x-api-key` from an Anthropic client. A client that requires keys to start with `sk-` will not work.

### 3. Send a request

```bash
curl -sN localhost:3789/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AIPASS_COOKIE" \
  -d '{"model":"claude-sonnet-5@default","messages":[{"role":"user","content":"hi"}]}'
```

`GET /v1/models` lists every accepted model id. Ids are case-sensitive, Claude ids carry a `@provider` suffix, and `gemini-3.1-flash-lite` is the free default.

## Endpoints

- `POST /v1/chat/completions`: OpenAI protocol, streaming by default
- `POST /v1/messages`: Anthropic protocol, buffered unless `stream: true`
- `POST /v1/messages/count_tokens`: the estimated size of a prompt, no credential needed
- `GET /v1/models`: the model catalog, no credential needed
- `GET /v1/usage`: the account's credit balance, needs the cookie
- `GET /health`: liveness, no credential needed
- `GET /`: OpenAPI docs rendered by Scalar, also at `/openapi.json`

## Use it from an Anthropic client

Change the environment of any app that speaks the Anthropic protocol, such as a [baymi](https://github.com/PunGrumpy/baymi) agent:

```bash
ANTHROPIC_BASE_URL=https://your_deployment_here/v1
ANTHROPIC_API_KEY=your_cookie_header_here
MODEL=claude-sonnet-5@default
```

Text, `tool_use` and `tool_result` blocks are carried through. Images, documents, `max_tokens`, `thinking` and sampling settings are dropped.

Claude Code reads `/v1/messages` under the base URL itself, so leave off the `/v1` the SDKs add, and name both models, because the ids Claude Code sends are outside the catalog:

```bash
ANTHROPIC_BASE_URL=https://your_deployment_here
ANTHROPIC_AUTH_TOKEN=your_cookie_header_here
ANTHROPIC_MODEL=claude-sonnet-5@default
ANTHROPIC_SMALL_FAST_MODEL=gemini-3.1-flash-lite
```

It is a heavy caller: its system prompt and tool definitions make a first request of around 100 kB, and every turn resends the whole conversation, so a session spends the daily allowance quickly.

Its system prompt is also the shape the edge is most likely to refuse, so a `400` naming an edge refusal on the very first request is worth expecting; see [When the edge refuses a prompt](#when-the-edge-refuses-a-prompt).

## Use it as an AI SDK provider

`createAipass` returns models that `streamText` and `generateText` accept, with no HTTP hop:

```ts
import { streamText } from "ai";
import { createAipass } from "aipass-proxy/provider";

const aipass = createAipass({ cookie: process.env.AIPASS_COOKIE ?? "" });

const result = streamText({
  model: aipass("claude-sonnet-5@default"),
  prompt: "hi",
});
```

The provider implements `LanguageModelV2` for `ai` v5. Sampling settings return `unsupported-setting` warnings, token `usage` is estimated from the text, and `providerMetadata.aipass.credits` holds the credit balance. An app on `ai` v7 should use `/v1/messages` over HTTP instead.

## Tool calling over text

AI Pass answers with plain text, so tools are emulated. The proxy describes each offered tool in the prompt and asks the model to call one with a fenced block:

````markdown
```tool_call
{"name": "get_weather", "input": {"city": "Bangkok"}}
```
````

Each such block becomes a `tool_calls` entry (OpenAI), a `tool_use` block (Anthropic), or a `tool-call` part (AI SDK). Larger models follow the format reliably. A small model may narrate the call instead, which reaches the client as text.

## How a request reaches AI Pass

Each proxied request does four things:

1. **Create a throwaway conversation** with `POST /chat.data`.
2. **Send one flattened turn**: the backend ignores multi-message bodies, so the whole conversation becomes a single role-labelled user message.
3. **Stream the reply**: `text-delta` events become OpenAI chunks or Anthropic events.
4. **Delete the conversation**, so the account’s chat list stays clean.

Every agent round is one more conversation upstream, so tool-heavy loops spend the daily credit allowance fast.

## Usage in credits

AI Pass meters in credits per period, not in tokens, and reports no token counts at all. Every reply reports the credit balance instead, alongside token counts the proxy estimates from the text it sent and received. Each completion reads the balance as it starts and again as it ends, and puts the result under `usage.credits`:

```json
{
  "usage": {
    "prompt_tokens": 25001,
    "completion_tokens": 12,
    "total_tokens": 25013,
    "credits": {
      "spent": 30.25,
      "used": 130.25,
      "limit": 10000,
      "available": 9869.75,
      "reset_at": "2026-09-04T00:00:00.000Z"
    }
  }
}
```

`spent` is what this reply cost, as the difference between the two reads. It is absent when either read failed, and the whole `credits` object is absent when both did. Where to find it depends on the protocol:

- **OpenAI stream**: the final chunk, the one with `finish_reason`
- **Anthropic stream**: the `message_delta` event
- **AI SDK provider**: `providerMetadata.aipass.credits`

Token counts are an estimate, not a tokeniser: about four characters to a token for ASCII and one and a half for Thai and the other non-Latin scripts, counted on the flattened prompt the proxy sends, which carries the tool guide and the role labels alongside the conversation. `POST /v1/messages/count_tokens` returns the same estimate for a prompt without sending it, so a client that manages its own context window has something to read.

`GET /v1/usage` returns the same balance without spending anything:

```bash
curl -s localhost:3789/v1/usage -H "authorization: Bearer $AIPASS_COOKIE"
```

## Deploy to Vercel

`src/index.ts` default-exports the Elysia app and `vercel.json` sets `bunVersion`, so the repo deploys as is. Keep Deployment Protection on: the deployment stores no credential, but it relays to AI Pass for anyone holding a valid cookie.

Streams on Vercel are bounded by the function duration, not the 240s idle timeout, so a slow model can be cut off mid-reply.

## Logging

Prompts and cookies never reach the logs. Each request emits one wide event with sizes, timings, upstream status, caller identity, the account’s credit balance, and the credits the reply spent. Set `POSTHOG_API_KEY` to forward those events to PostHog as `aipass_proxy_request`.

## When the edge refuses a prompt

AI Pass sits behind an edge that answers some requests itself, with a `403`, before the chat backend runs. It scores what a request _contains_ rather than how long it is, so prose of one length passes where an agent-style prompt of the same length is refused, and a shell path or an environment variable carried in the prompt is reported to be enough on its own.

The proxy reports that as a **400**, not a 502, because a retry of the identical body reaches the identical verdict and a bad gateway invites one:

```json
{
  "error": {
    "message": "upstream 403 (text/html); the AI Pass edge refused this before the model ran, on what the prompt contains rather than how long it is — resending the same text will be refused again",
    "detail": "<the edge's own body, truncated>"
  }
}
```

An Anthropic client sees the same thing as `invalid_request_error`. The wide event carries `edgeRefused` so a run of them is visible in the logs.

The trigger set is undocumented, so the proxy names the shape of the problem and hands back the edge's own body rather than guessing which string was the one. If you hit it, the thing to change is the prompt, most often a literal path or variable in a system prompt. This is also why a heavy agent client can fail on its first request while plain chat of the same size works.

## Limits

- **Token counts are estimated**: AI Pass reports none, so the proxy counts characters. Credits are the exact figure, see [Usage in credits](#usage-in-credits).
- **Cookies expire**: a 502 whose message says the cookie is stale means you need a fresh one.
- **The edge can refuse a prompt outright**: see [When the edge refuses a prompt](#when-the-edge-refuses-a-prompt).
- **Unknown model ids return 400** instead of being forwarded.

## Development scripts

- `bun run dev`: watch mode
- `bun run test`: Bun test suite
- `bun run check`: Ultracite check
- `bun run fix`: format and autofix
- `bun run typecheck`: `tsc --noEmit`

## Personal use only

This is a reverse-engineered adapter over an undocumented private API. Keep it to a single account you own. Don’t publish it as a service, point it at accounts that aren’t yours, or run it at a scale that would burden the shared program.
