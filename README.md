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

`GET /v1/models` lists every model id the proxy routes, with a `kind` saying which endpoint takes it. Ids are case-sensitive, Claude ids carry a `@provider` suffix, and `gemini-3.1-flash-lite` is the free default.

## Endpoints

- `POST /v1/chat/completions`: OpenAI protocol, streaming by default
- `POST /v1/messages`: Anthropic protocol, buffered unless `stream: true`
- `POST /v1/images/generations`: one image, buffered
- `POST /v1/videos`: one video; blocks for the whole render, see [Images, video and music](#images-video-and-music)
- `POST /v1/audio/generations`: one music clip, buffered
- `POST /v1/messages/count_tokens`: the estimated size of a prompt, no credential needed
- `GET /v1/models`: the model catalog, richer with the cookie than without
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

The proxy carries text, `tool_use`, `tool_result`, `image` and `document` blocks through, and a `thinking` block picks a reasoning level. It drops `max_tokens` and the sampling settings.

Claude Code appends `/v1/messages` to the base URL itself, so leave off the `/v1` the SDKs add. Name both models, because the ids Claude Code sends are outside the catalog:

```bash
ANTHROPIC_BASE_URL=https://your_deployment_here
ANTHROPIC_AUTH_TOKEN=your_cookie_header_here
ANTHROPIC_MODEL=claude-sonnet-5@default
ANTHROPIC_SMALL_FAST_MODEL=gemini-3.1-flash-lite
```

Claude Code is a heavy caller. Its system prompt and tool definitions make a first request of about 100 KB, and every turn resends the whole conversation, so one session can spend the daily allowance.

Its system prompt is also the shape the edge is most likely to refuse, so expect a `400` naming an edge refusal on the first request. See [When the edge refuses a prompt](#when-the-edge-refuses-a-prompt).

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

The provider implements `LanguageModelV2` for `ai` v5. An app on `ai` v7 should use `/v1/messages` over HTTP instead. What the provider carries:

- **Files**: file parts are uploaded as attachments, and a generated file comes back as the SDK's own file part
- **Reasoning**: `providerOptions.aipass.thinkingLevel` picks a level
- **Sampling settings**: returned as `unsupported-setting` warnings
- **Usage**: token counts are estimated from the text, and `providerMetadata.aipass.credits` holds the credit balance

## Attachments

Send a file inline and the proxy uploads it with the turn. OpenAI `image_url` and `file` parts, Anthropic `image` and `document` blocks, and AI SDK file parts all work:

```bash
curl -s localhost:3789/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AIPASS_COOKIE" \
  -d '{
    "model": "gemini-3.1-flash-lite",
    "messages": [{"role": "user", "content": [
      {"type": "text", "text": "what is in this?"},
      {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KG..."}}
    ]}]
  }'
```

The bytes have to arrive inline, as a data URI or as base64 in the block that names them. The proxy refuses a remote URL with a `400` rather than fetching it: a deployment that fetches any URL a caller names is a request forger pointed at whatever network it sits in. Fetch the file yourself and send the bytes.

The proxy accepts files up to 20 MB. Uploading one takes three calls before the turn is sent: the proxy reserves a slot, puts the bytes at a signed storage URL, then confirms the object. A file the proxy cannot read fails the request instead of being dropped, because a model answering about a document it never received is worse than an error naming the document.

## Reasoning effort

AI Pass takes a reasoning level, not a token budget, and each model advertises the levels it will take. Every protocol has a way to ask:

| Protocol | Field |
| --- | --- |
| OpenAI | `thinking_level`, or `reasoning_effort` with OpenAI's own values |
| Anthropic | `thinking_level`, or a `thinking` block whose `budget_tokens` picks a level |
| AI SDK | `providerOptions.aipass.thinkingLevel` |

The levels are `low`, `medium` and `high`, plus `max` on Claude Opus. Asking for a level a model does not offer is not an error: the proxy drops the level, names it in the wide event, and the reply still comes. `GET /v1/models` reports each model's levels when you send the cookie.

The Anthropic budget thresholds are the proxy's own, because AI Pass publishes no token figure for a level. Under 4096 is `low`, under 16384 is `medium`, and above that is `high`.

## Images, video and music

Each kind has its own endpoint, and the same models also work through `/v1/chat/completions`, where the file comes back as a markdown image or link in the reply.

```bash
curl -s localhost:3789/v1/images/generations \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AIPASS_COOKIE" \
  -d '{"model":"gpt-image-2","prompt":"a cat in Chiang Mai","size":"1024x768"}'
```

AI Pass describes an image by its shape rather than its pixel size, so the proxy rounds `size` to the nearest ratio it offers: `1:1`, `3:4` or `4:3`. Send `aspect_ratio` to name the shape outright. Each request makes one file, so the proxy refuses `n` above one rather than quietly making a single image.

Video blocks for the whole render. AI Pass submits a job and polls it, with no streaming variant, so `POST /v1/videos` holds the connection until the render is done, which takes minutes. The proxy cancels a job that fails or loses its caller, because a job left running keeps spending the video quota. On Vercel the function duration cuts this off long before a render finishes, so run the proxy locally for video.

Each video model accepts a different set of options, and the upstream rejects the whole body without naming a field, so the proxy drops an option the model does not take rather than sending it. `GET /v1/models` lists each model's options under `options`:

| Option | Models |
| --- | --- |
| `aspect_ratio`, `style_preprompt` | every video model |
| `duration`, `camera_fixed`, `generate_audio` | seedance only |
| `resolution` (`480p`, `720p`) | `seedance-2.0-fast`, `seedance-2.0-mini` |

The generated file sits behind the session cookie on the AI Pass origin, so the proxy reads it and returns the bytes: `b64_json` by default, or `url` as a data URI on request. Past a per-kind cap the file stays a link, with a note saying the link needs a logged-in browser, rather than a URL that 401s. On the AI SDK provider a generated file comes back as the SDK's own file part.

| Kind  | Inline cap |
| ----- | ---------- |
| Image | 5 MB       |
| Audio | 25 MB      |
| Video | 50 MB      |

## Tool calling over text

AI Pass answers with plain text, so tools are emulated. The proxy describes each offered tool in the prompt and asks the model to call one with a fenced block:

````markdown
```tool_call
{"name": "get_weather", "input": {"city": "Bangkok"}}
```
````

Each such block becomes a `tool_calls` entry (OpenAI), a `tool_use` block (Anthropic), or a `tool-call` part (AI SDK). Larger models follow the format. A small model may narrate the call instead, and that narration reaches the client as text.

## How a request reaches AI Pass

Each proxied request does four things:

1. **Create a throwaway conversation** with `POST /chat.data`.
2. **Send one flattened turn**: the backend ignores multi-message bodies, so the whole conversation becomes a single role-labelled user message.
3. **Stream the reply**: `text-delta` events become OpenAI chunks or Anthropic events.
4. **Delete the conversation**: the account’s chat list stays clean.

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

Token counts are an estimate, not a tokeniser's output. The proxy counts about four characters to a token for ASCII and one and a half for Thai and other non-Latin scripts. It counts the flattened prompt it sends, which carries the tool guide and the role labels alongside the conversation. `POST /v1/messages/count_tokens` returns the same estimate without sending the prompt, so a client that manages its own context window has something to read.

`GET /v1/usage` returns the same balance without spending anything:

```bash
curl -s localhost:3789/v1/usage -H "authorization: Bearer $AIPASS_COOKIE"
```

## Deploy to Vercel

`src/index.ts` default-exports the Elysia app and `vercel.json` sets `bunVersion`, so the repo deploys as is. Keep Deployment Protection on: the deployment stores no credential, but it relays to AI Pass for anyone holding a valid cookie.

The function duration bounds a stream on Vercel, not the 240s idle timeout, so a slow model can be cut off mid-reply. `POST /v1/videos` holds the connection for a render that takes minutes, so it will not survive on Vercel at all. Run the proxy locally for video.

## Logging

Prompts and cookies never reach the logs. Each request emits one wide event with sizes, timings, upstream status, caller identity, the account’s credit balance, and the credits the reply spent. Set `POSTHOG_API_KEY` to forward those events to PostHog as `aipass_proxy_request`.

## When the edge refuses a prompt

AI Pass sits behind an edge that answers some requests itself with a `403`, before the chat backend runs. The edge scores what a request contains rather than how long it is: prose of one length passes where an agent-style prompt of the same length is refused. A shell path or an environment variable in the prompt can be enough on its own.

The proxy reports that as a `400`, not a `502`, because a bad gateway invites a retry and a retry of the identical body reaches the identical verdict:

```json
{
  "error": {
    "message": "upstream 403 (text/html); the AI Pass edge refused this before the model ran, on what the prompt contains rather than how long it is — resending the same text will be refused again",
    "detail": "<the edge's own body, truncated>"
  }
}
```

An Anthropic client sees the same thing as `invalid_request_error`. The wide event carries `edgeRefused` so a run of them is visible in the logs.

The trigger set is undocumented, so the proxy names the shape of the problem and returns the edge's own body rather than guessing which string tripped it. If you hit it, change the prompt. A literal path or variable in a system prompt is the usual cause, and it is also why a heavy agent client can fail on its first request while plain chat of the same size works.

## Limits

- **Token counts are estimated**: AI Pass reports none, so the proxy counts characters. Credits are the exact figure, see [Usage in credits](#usage-in-credits).
- **Cookies expire**: a 502 whose message says the cookie is stale means you need a fresh one.
- **The edge can refuse a prompt outright**: see [When the edge refuses a prompt](#when-the-edge-refuses-a-prompt).
- **Unknown model ids return 400**: the proxy does not forward them.
- **Attachments must be inline**: a URL is refused, not fetched. See [Attachments](#attachments).
- **Video holds the connection open**: for the whole render, so it cannot run behind a function timeout.
- **Media and attachments are untested against a live account**: they are built from the upstream protocol and covered by tests against a stubbed upstream. Nothing here has run against de.aipass.net, so expect to fix something the first time you use them for real.

## Development scripts

- `bun run dev`: watch mode
- `bun run test`: Bun test suite
- `bun run check`: Ultracite check
- `bun run fix`: format and autofix
- `bun run typecheck`: `tsc --noEmit`

## Personal use only

This is a reverse-engineered adapter over an undocumented private API. Keep it to a single account you own. Don’t publish it as a service, point it at accounts that aren’t yours, or run it at a scale that would burden the shared programme.

That is a request, not a licence term: the code is [MIT](LICENSE), and the paragraph above asks you to be a good guest of a free public programme rather than restricting what you may do with the software.

## Credits

[aipass-bridge](https://github.com/niawjunior/aipass-bridge) (MIT) mapped the upstream protocol this proxy speaks first: the upload handshake, the fields `send-message` accepts, and the shape of the video job. The implementation here is its own, but the map is theirs.
