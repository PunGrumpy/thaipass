# AIPass Proxy

An OpenAI-compatible `/v1/chat/completions` proxy in front of the [AI Pass](https://de.aipass.net) chat backend. It lets a personal tool (t3, Codex, any OpenAI client) reach the same models the account already sees in the web UI: Claude Opus 5, GPT-5.6, Gemini 3.x, GLM 5.2, DeepSeek, Grok, and others.

> **Personal use only.** This drives _your own_ AI Pass account with _your own_ session cookie, from _your own_ machine. It is not for redistribution, multiple accounts, or any kind of scale. See [Scope](#scope).

## How it works

AI Pass is a stateful chat app that speaks the Vercel AI SDK v5 UI-message stream behind a browser session cookie. Each proxied request does four things.

1. **Creates a throwaway conversation.** `POST /chat.data`, form-encoded, `intent=create-conversation`. The conversation id is the first 16 hex chars of a client-generated UUID.
2. **Sends one flattened turn.** `POST /actions/send-message/<id>`, JSON. The backend answers from _server-stored_ history and ignores multi-message bodies, so the whole OpenAI conversation (system plus turns) is flattened into a single role-labelled user message. A fresh conversation per request keeps that history empty, so nothing bleeds between requests.
3. **Streams the reply.** The `text-delta` SSE events become OpenAI `chat.completion.chunk`s, or accumulate into one non-streaming response.
4. **Deletes the conversation.** `POST /actions/update-conversation.data` with `intent=delete`, so the account's chat list stays clean.

## Setup

```bash
bun install
cp .env.example ~/.config/aipass-proxy.env   # then chmod 600 and fill AIPASS_COOKIE
bun run start
```

`AIPASS_COOKIE` is the full `Cookie:` header from a logged-in browser session, and it must include `__Secure-ai_passport_auth.session_token`. The proxy parses the env file itself, dotenv-style. Never `source` it in a shell, because the cookie contains `;` and spaces that a shell would split into separate commands. Quoting a value is fine. The loader strips one matched pair of surrounding quotes, then checks every `AIPASS_*` variable and exits naming the one that is wrong.

| var | default | notes |
| --- | --- | --- |
| `AIPASS_COOKIE` | none | required; full Cookie header value |
| `AIPASS_ORIGIN` | `https://de.aipass.net` |  |
| `AIPASS_HOST` | `127.0.0.1` | bind address; keep off `0.0.0.0` |
| `AIPASS_PORT` | `3789` |  |
| `AIPASS_ENV_FILE` | `~/.config/aipass-proxy.env` |  |

## Endpoints

- `POST /v1/chat/completions`, streaming and non-streaming
- `GET /v1/models`, the chat model catalog
- `GET /health`

```bash
curl -sN localhost:3789/v1/chat/completions -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-5@default","messages":[{"role":"user","content":"hi"}]}'
```

Model ids are case-sensitive and Claude carries a `@provider` suffix (`claude-opus-5@azure`, `claude-sonnet-5@default`). The full list is in [`src/lib/models.ts`](src/lib/models.ts). `gemini-3.1-flash-lite` is the free default.

## Notes

- The cookie is short-lived. When it expires, requests fail with `upstream 3xx ... cookie is stale`. Refresh the cookie in the env file and restart.
- The proxy has no auth of its own. Bind it to a trusted interface, loopback or a private VPN address, never a public one. The cookie grants full account access.

## Layout

```
src/index.ts     builds the Elysia app and starts the server
src/routes/      one module per endpoint
src/lib/         env, config, logging, the AI Pass client, wire-format translation
```

## Scripts

- `bun run dev`, watch mode
- `bun run check`, Ultracite (oxlint + oxfmt) check
- `bun run fix`, format and autofix
- `bun run typecheck`, `tsc --noEmit`

## Scope

This is a reverse-engineered adapter over an undocumented private API. Keep it to a single account you own, for your own use. Don't publish it as a service, point it at accounts that aren't yours, or run it at a scale that would burden the shared program.
