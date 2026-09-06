# thaipass

[![runtime](https://img.shields.io/badge/runtime-bun-000000?style=flat&colorA=000000&colorB=000000)](https://bun.sh) [![framework](https://img.shields.io/badge/framework-elysia-000000?style=flat&colorA=000000&colorB=000000)](https://elysiajs.com) [![deploy](https://img.shields.io/badge/deploy-vercel-000000?style=flat&colorA=000000&colorB=000000)](https://vercel.com)

Point your OpenAI or Anthropic client at [AI Pass](https://de.aipass.net) and use the models your account already sees in the web UI.

thaipass is two things. The proxy in `apps/proxy` serves an OpenAI-compatible `/v1/chat/completions` and an Anthropic-compatible `/v1/messages` in front of the AI Pass chat backend. It also generates images, video and music, reports the account's credit balance, and can earn the monthly learning points for you. The `thaipass` package in `packages/thaipass` is an AI SDK provider that does the same without HTTP.

Every request carries your own session cookie. The proxy stores no credential and drives no account but yours. See [Personal use only](#personal-use-only).

## Quick start

Three steps get a reply: run the server, copy your cookie, send a request.

### 1. Run the proxy

```bash
bun install
bun run start
```

The server listens on `http://127.0.0.1:3789`. No `.env` is needed. See [Settings](#settings) to change the port or turn on PostHog.

### 2. Copy your session cookie

Log in to AI Pass and copy the full `Cookie` header from any request to `de.aipass.net`. It must contain `__Secure-ai_passport_auth.session_token`. Keep the percent-encoding as the browser sends it.

That string is your API key. Send it as a bearer token, or as `x-api-key` from an Anthropic client. A client that insists keys start with `sk-` will not work.

### 3. Send a request

```bash
curl -sN localhost:3789/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AIPASS_COOKIE" \
  -d '{"model":"claude-sonnet-5@default","messages":[{"role":"user","content":"hi"}]}'
```

`gemini-3.1-flash-lite` is the free default model. `GET /v1/models` lists the rest. See [Models](#models).

## Connect a client

Each client needs a base URL, the cookie as its key, and a model id from the catalog.

### Anthropic SDK and agents

Set the environment of any app that speaks the Anthropic protocol, such as a [baymi](https://github.com/PunGrumpy/baymi) agent:

```bash
ANTHROPIC_BASE_URL=https://your_deployment_here/v1
ANTHROPIC_API_KEY=your_cookie_header_here
MODEL=claude-sonnet-5@default
```

The proxy passes text, `tool_use`, `tool_result`, `image` and `document` blocks through. A `thinking` block picks a reasoning level. The proxy drops `max_tokens` and the sampling settings.

### Claude Code

Claude Code appends `/v1/messages` to the base URL itself, so leave off the `/v1`. Name both models, because the ids Claude Code sends by default are not in the catalog:

```bash
ANTHROPIC_BASE_URL=https://your_deployment_here
ANTHROPIC_AUTH_TOKEN=your_cookie_header_here
ANTHROPIC_MODEL=claude-sonnet-5@default
ANTHROPIC_SMALL_FAST_MODEL=gemini-3.1-flash-lite
```

Two warnings before you start a session. The first request is about 100 KB of system prompt and tool definitions, and every turn resends the whole conversation, so one session can spend the daily allowance. That system prompt is also the shape the AI Pass edge refuses most, so the first request may come back as a `400`. See [400: the edge refused the prompt](#400-the-edge-refused-the-prompt).

### OpenAI SDK

Point any OpenAI client at `/v1` with the cookie as the API key:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:3789/v1",
  apiKey: process.env.AIPASS_COOKIE,
});
```

### AI SDK provider

The provider ships as the `thaipass` package. `createAipass` returns models that `streamText` and `generateText` accept, with no HTTP hop:

```bash
bun add thaipass
```

```ts
import { streamText } from "ai";
import { createAipass } from "thaipass";

const aipass = createAipass({ cookie: process.env.AIPASS_COOKIE ?? "" });

const result = streamText({
  model: aipass("claude-sonnet-5@default"),
  prompt: "hi",
});
```

The provider implements `LanguageModelV2` for `ai` v5. On `ai` v7 use `/v1/messages` over HTTP instead. Until the first npm release, build it from this repo: `bun run build` writes `packages/thaipass/dist`, and `bun link` in that directory makes `thaipass` resolvable.

`createAipass` also takes `origin` for a different AI Pass host and `logger` for the warnings the proxy has no reply to attach to. Both apply to the whole process, and both have defaults.

File parts upload as attachments, and a generated file comes back as the SDK's own file part. `providerOptions.aipass.thinkingLevel` picks a reasoning level, and sampling settings come back as `unsupported-setting` warnings. `usage` holds token estimates, and `providerMetadata.aipass.credits` holds the credit balance.

## Endpoints

Every route the proxy serves:

| Route | What it does | Cookie |
| --- | --- | --- |
| `POST /v1/chat/completions` | OpenAI protocol, streams by default | yes |
| `POST /v1/messages` | Anthropic protocol, buffered unless `stream: true` | yes |
| `POST /v1/messages/count_tokens` | Estimated size of a prompt | no |
| `POST /v1/images/generations` | One image, buffered | yes |
| `POST /v1/videos` | One video, blocks for the whole render | yes |
| `POST /v1/audio/generations` | One music clip, buffered | yes |
| `GET /v1/models` | The account's model catalog | yes |
| `GET /v1/usage` | The account's credit balance | yes |
| `GET /v1/lms/exp` | The account's learning EXP | yes |
| `POST /v1/lms/learn` | Watches video lessons until a target EXP | yes |
| `GET /health` | Liveness | no |
| `GET /` | OpenAPI docs rendered by Scalar, JSON at `/openapi.json` | no |

## Settings

Every setting has a default, so the proxy runs with no `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AIPASS_ORIGIN` | `https://de.aipass.net` | Upstream origin |
| `AIPASS_HOST` | `127.0.0.1` | Bind address, local only |
| `AIPASS_PORT` | `3789` | Port, local only |
| `POSTHOG_API_KEY` | none | Project token (`phc_…`), enables PostHog |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog ingestion host |

## Models

`GET /v1/models` reads the account's catalog live from AI Pass. Each entry carries a `kind` naming the endpoint that takes it, and the proxy checks every request against the same catalog. A model AI Pass adds works the day it appears. A model AI Pass retires returns `400`. Neither needs a proxy release.

Ids are case-sensitive, and Claude ids carry a `@provider` suffix, as in `claude-sonnet-5@default`.

### Reasoning effort

AI Pass takes a reasoning level, not a token budget, and each model advertises the levels it accepts. Each protocol has a field for it:

| Protocol | Field |
| --- | --- |
| OpenAI | `thinking_level`, or `reasoning_effort` with OpenAI's own values |
| Anthropic | `thinking_level`, `output_config.effort`, or a `thinking` block whose `budget_tokens` picks a level |
| AI SDK | `providerOptions.aipass.thinkingLevel` |

The levels are `low`, `medium` and `high`, plus `max` on Claude Opus. Asking for a level the model does not offer is not an error. The proxy drops it, records that in the wide event, and the reply still comes. `GET /v1/models` lists each model's levels.

An Anthropic `thinking` block of type `adaptive` or `enabled` turns thinking on. With it, `output_config.effort` names the level, and `xhigh` rounds down to `high`. Without an effort, `budget_tokens` picks the level by thresholds the proxy chose, because AI Pass publishes no token figure per level: under 4096 is `low`, under 16384 is `medium`, and above that is `high`. A block that names neither gets `medium`.

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

The bytes must arrive inline, as a data URI or as base64 in the block that names them. The proxy refuses a remote URL with a `400` instead of fetching it, because a deployment that fetches any URL a caller names is a request forger pointed at whatever network it sits in. Fetch the file yourself and send the bytes.

Files go up to 20 MB. An upload takes three calls before the turn is sent: reserve a slot, put the bytes at a signed storage URL, confirm the object. A file the proxy cannot read fails the request instead of being dropped. A model answering about a document it never received is worse than an error naming the document.

## Images, video and music

Each kind has its own endpoint. The same models also work through `/v1/chat/completions`, where the file comes back as a markdown image or link in the reply.

```bash
curl -s localhost:3789/v1/images/generations \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AIPASS_COOKIE" \
  -d '{"model":"gpt-image-2","prompt":"a cat in Chiang Mai","size":"1024x768"}'
```

AI Pass describes an image by its shape, not its pixel size, so the proxy rounds `size` to the nearest ratio it offers: `1:1`, `3:4` or `4:3`. Send `aspect_ratio` to name the shape outright. Each request makes one file, so the proxy refuses `n` above one instead of quietly making a single image.

### Video

Video blocks for the whole render. AI Pass submits a job and polls it, with no streaming variant, so `POST /v1/videos` holds the connection until the render is done, which takes minutes. The proxy cancels a job that fails or loses its caller, because a job left running keeps spending the video quota. On Vercel the function limit cuts this off long before a render finishes. Run the proxy locally for video.

Each video model accepts a different set of options, and AI Pass rejects the whole body without naming the field, so the proxy drops an option the model does not take. `GET /v1/models` lists each model's options under `options`:

| Option | Models |
| --- | --- |
| `aspect_ratio`, `style_preprompt` | every video model |
| `duration`, `camera_fixed`, `generate_audio` | seedance only |
| `resolution` (`480p`, `720p`) | `seedance-2.0-fast`, `seedance-2.0-mini` |

### How the file comes back

The generated file sits behind the session cookie on the AI Pass origin, so the proxy fetches it and returns the bytes: `b64_json` by default, or `url` as a data URI on request. Past a per-kind cap the file stays a link, with a note that the link needs a logged-in browser, instead of a URL that answers 401. On the AI SDK provider a generated file is the SDK's own file part.

| Kind  | Inline cap |
| ----- | ---------- |
| Image | 5 MB       |
| Audio | 25 MB      |
| Video | 50 MB      |

## Tool calling

AI Pass answers with plain text, so the proxy emulates tools. It describes each offered tool in the prompt and asks the model to call one with a fenced block:

````markdown
```tool_call
{"name": "get_weather", "input": {"city": "Bangkok"}}
```
````

Each such block becomes a `tool_calls` entry (OpenAI), a `tool_use` block (Anthropic), or a `tool-call` part (AI SDK). Larger models follow the format. A small model may narrate the call instead, and that narration reaches the client as text.

## How a request reaches AI Pass

Each proxied request does four things:

1. Creates a throwaway conversation with `POST /chat.data`
2. Sends one flattened turn. The backend ignores multi-message bodies, so the whole conversation becomes a single role-labelled user message
3. Streams the reply. `text-delta` events become OpenAI chunks or Anthropic events
4. Deletes the conversation, so the account's chat list stays clean

Every agent round is one more conversation upstream, so tool-heavy loops spend the daily credit allowance fast.

## Usage in credits

AI Pass meters in credits per period, not tokens, and reports no token counts. Every reply carries the credit balance instead, next to token counts the proxy estimates from the text. Each completion reads the balance as it starts and again as it ends, and puts the result under `usage.credits`:

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

Token counts are an estimate, not a tokeniser's output. The proxy counts about four characters per token for ASCII and one and a half for Thai and other non-Latin scripts. It counts the flattened prompt it sends, which includes the tool guide and the role labels. `POST /v1/messages/count_tokens` returns the same estimate without sending the prompt, so a client that manages its own context window has something to read.

`GET /v1/usage` returns the balance without spending anything:

```bash
curl -s localhost:3789/v1/usage -H "authorization: Bearer $AIPASS_COOKIE"
```

## Earn LMS points

AI Pass runs a learning site at `/lms` that pays EXP per completed lesson, and the membership tier wants a monthly minimum. The proxy can do the watching for you, from a command on your machine or from a scheduler through the API.

### On your machine

`bun run lms` runs the learner in-process, with no function limit and no loop to write:

```bash
AIPASS_COOKIE='your_cookie_header_here' bun run lms             # reach 100 this period
AIPASS_COOKIE='your_cookie_header_here' bun run lms --earn 200  # earn 200 more
bun run lms --cookie-file ~/.aipass-cookie --dry-run            # see what it would watch
```

Run `--dry-run` first. It reads the catalogue and reports each lesson it would watch, with the tier's EXP per video lesson, and changes nothing.

The command prints one line per course and lesson, redraws the stamp progress in place, and exits 0 when the goal is reached, 1 when it is not, and 2 on a usage error. `--json` prints the same lines the route streams. This command is the one place in the repo that reads a cookie from the environment. The server never does.

### Through the API

`POST /v1/lms/learn` watches every unwatched video lesson until the account has earned a target, 100 EXP by default:

```bash
curl -sN localhost:3789/v1/lms/learn \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AIPASS_COOKIE" \
  -d '{"target":100,"pace":1}'
```

The reply is one JSON object per line as the run goes: the period's EXP before, a `course` line per course it enters, a `lesson` line when a lesson starts and when it completes, a `stamp` line per ten seconds of video, the EXP after, and a `done` line saying how much was earned and why it stopped. Pass `-N` to curl so the lines show as they arrive. Articles and quizzes are left alone, because the proxy only watches video.

| Field | Default | Meaning |
| --- | --- | --- |
| `target` | 100 | The period's EXP to reach, as the LMS reports it. A run whose period already has it touches nothing |
| `earn` | none | Earn this much EXP in this run, whatever the period already has. Overrides `target` |
| `pace` | 1 | Playback speed, up to 16. At 1 a ten minute video takes ten minutes |
| `max_lessons` | 50 | Stop after this many lessons regardless |
| `dry_run` | false | List what would be learned and change nothing |
| `budget_seconds` | none, 270 on Vercel | End the run before this much wall-clock has passed. The `done` line then has `paused: true`, and the next call resumes from the last stamp |

`GET /v1/lms/exp` returns the session's EXP payload, the tier and the achievement summary as the LMS reports them, with the period's figure as `monthly`.

### On a schedule

Every call stops on its own: at the target, at the end of the videos, or at `budget_seconds` with `paused: true`, from where the next call resumes. So the whole automation from any scheduler is one call, repeated:

- **Monthly minimum**: call with `{"target": 100}` every ten minutes or once an hour. A call whose period already has the target reads one figure and ends, so the idle calls cost nothing
- **Keep accumulating**: call with `{"earn": 100}` on the same schedule. Each call earns that much more, whatever the period has, until the videos run out

On Vercel each call stops itself at 270 seconds, under the function limit, so a lesson longer than that spans two calls. This loop calls again until the `done` line says `paused: false`:

```bash
for attempt in $(seq 1 12); do
  curl -sN https://your_deployment_here/v1/lms/learn \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $AIPASS_COOKIE" \
    -d '{"target":100}' | tee /dev/stderr | grep -Eq '"paused": ?false' && break
  sleep 10
done
```

The sleep keeps a refused request from becoming a tight loop, and the cap bounds a bad day to an hour. Pipe the output through nothing else, because a pretty-printer changes the line the loop greps for.

### What the learner sends

Three things to know before relying on it:

- **The stamp is the player's own.** I read it off the lesson page and confirmed it against a live session. Each stamp carries the video content id, the enrolment, the progress record and the whole seconds watched, never more than ten past the last one. A stamp the LMS answers with `COMPLETED` is what earns the EXP. The proxy then asks the course to close, as the page does, and prices the lesson by how much the period's EXP moved.
- **The LMS needs its own cookies.** Copy the `Cookie` header from a request made while the browser is on a `/lms` page, not from the chat, so the tenant cookie the LMS sets travels with the session token. A `401` from the LMS means the cookie is stale or came from the wrong page.
- **Keep the pace at 1.** The player blocks seeking on a first watch and never lets a stamp advance more than ten seconds, so a run takes as long as the videos do.

The proxy stops at the first failed call instead of trying the next course. An undocumented backend that refused once will refuse again, and the programme awards these points for learning a person is meant to do. This is your account and your call. The proxy sends nothing a browser watching the video would not.

## Deploy to Vercel

Set the Vercel project's Root Directory to `apps/proxy` and turn on the option to include source files outside it, so the build can read `packages/core`. There, `vercel.json` sets `bunVersion`, runs `bun run build`, and names `dist` as the output directory. The build inlines `packages/core` into one file and leaves the real dependencies as imports, so Vercel traces them into the function's `node_modules` as it did before the split. The root `bunfig.toml` installs hoisted for the same reason: real directories, not links into a store outside the Root Directory. The install command in `vercel.json` deletes every `node_modules` first, because Vercel's build cache keeps the old isolated layout's links and store next to the hoisted one, and the tracer follows the links into a store the function does not carry. Keep Deployment Protection on. The deployment stores no credential, but it relays to AI Pass for anyone holding a valid cookie.

On Vercel the function duration bounds a stream, not the proxy's 240s idle timeout, so a slow model can be cut off mid-reply. Video will not survive there at all, and the LMS learner pauses itself at 270 seconds. See [Video](#video) and [On a schedule](#on-a-schedule).

## Logging

Prompts and cookies never reach the logs. Each request emits one wide event with sizes, timings, upstream status, caller identity, the credit balance, and the credits the reply spent. Set `POSTHOG_API_KEY` to forward those events to PostHog as `aipass_proxy_request`.

## Troubleshooting

Find the status the proxy returned:

### 400: the edge refused the prompt

AI Pass sits behind an edge that answers some requests itself with a `403`, before the chat backend runs. The edge scores what a request contains rather than how long it is, so it passes prose of one length and refuses an agent-style prompt of the same length. A shell path or an environment variable in the prompt can be enough on its own.

The proxy reports that as a `400`, not a `502`, because a bad gateway invites a retry and the same body gets the same verdict:

```json
{
  "error": {
    "message": "upstream 403 (text/html); the AI Pass edge refused this before the model ran, on what the prompt contains rather than how long it is — resending the same text will be refused again",
    "detail": "<the edge's own body, truncated>"
  }
}
```

An Anthropic client sees the same thing as `invalid_request_error`. The wide event carries `edgeRefused`, so a run of them shows in the logs.

The trigger set is undocumented, so the proxy names the shape of the problem and returns the edge's own body instead of guessing which string tripped it. If you hit it, change the prompt. A literal path or variable in a system prompt is the usual cause. It is also why a heavy agent client can fail on its first request while plain chat of the same size works.

### 400: unknown model

The proxy checks every model id against the live catalog and does not forward an id it cannot find. Ids are case-sensitive, and Claude ids need the `@provider` suffix. `GET /v1/models` lists what the account has.

### 502: the cookie is stale

Cookies expire. A `502` whose message says the cookie is stale means you need a fresh one. Copy it again as in [step 2](#2-copy-your-session-cookie).

### 401 from the LMS

The cookie came from the chat page instead of a `/lms` page, or it expired. See [What the learner sends](#what-the-learner-sends).

## Limits

- **Token counts are estimates.** AI Pass reports none, so the proxy counts characters. Credits are the exact figure, see [Usage in credits](#usage-in-credits)
- **Attachments must be inline.** The proxy refuses a URL rather than fetching it, see [Attachments](#attachments)
- **Video holds the connection open** for the whole render, so it cannot run behind a function timeout
- **Media and attachments have not met a live account.** I built them from the upstream protocol and tested them against a stubbed upstream. Nothing there has run against de.aipass.net, so expect to fix something the first time you use them for real

## Development

The repo is a Bun workspace run by Turborepo, with one package per job:

- `apps/proxy`: the server, the LMS command and everything HTTP
- `packages/core`: the AI Pass protocol the server and the provider share
- `packages/thaipass`: the AI SDK provider, built to `dist` for npm
- `packages/typescript-config`: the `tsconfig` base every package extends

Scripts from the root run in every package that has them:

- `bun run dev`: watch mode for the server
- `bun run test`: the Bun test suites
- `bun run typecheck`: `tsc --noEmit`
- `bun run build`: builds `thaipass` and the proxy's Vercel bundle into each package's `dist`
- `bun run check`: Ultracite check
- `bun run fix`: format and autofix

Releases of `thaipass` go through [Changesets](https://github.com/changesets/changesets). A change that should reach npm gets a changeset from `bun run changeset`, the release workflow turns pending changesets into a version pull request, and merging that pull request publishes.

## Personal use only

This is a reverse-engineered adapter over an undocumented private API. Keep it to a single account you own. Don't publish it as a service, point it at accounts that aren't yours, or run it at a scale that would burden the shared programme.

That is a request, not a licence term. The code is [MIT](LICENSE), and the paragraph above asks you to be a good guest of a free public programme rather than restricting what you may do with the software.
