# thaipass

Use your AI Pass account from any OpenAI or Anthropic client.

thaipass is a proxy with OpenAI-compatible and Anthropic-compatible endpoints in front of [AI Pass](https://de.aipass.net). The models your account sees in the web UI then work in Claude Code, Codex, Cursor, and the software development kits (SDKs). Each request sends your own session cookie, and the proxy stores no credential.

## Highlights

- **Three protocols**: `/v1/chat/completions`, `/v1/responses`, and `/v1/messages`
- **Live catalog**: every model your account can reach, checked on each request
- **Credits in every reply**: the balance before and after, plus a dollar estimate
- **Media**: image, video, and music generation
- **Learning points**: earns the monthly learning management system (LMS) points from the dashboard, a command, or a scheduler
- **AI SDK provider**: the `thaipass` package calls AI Pass with no HTTP hop

<p>
  <a href="https://bun.sh"><img alt="Runtime: Bun" src="https://img.shields.io/badge/runtime-bun-0a0a0a.svg?style=for-the-badge&amp;labelColor=000000" height="28"></a>
  <a href="https://www.npmjs.com/package/thaipass"><img alt="thaipass on npm" src="https://img.shields.io/npm/v/thaipass.svg?style=for-the-badge&amp;labelColor=000000" height="28"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/PunGrumpy/thaipass.svg?style=for-the-badge&amp;labelColor=000000" height="28"></a>
</p>

## Install

Clone the repo and start the proxy on `http://127.0.0.1:3001`:

```bash
bun install
bun run start
```

## Get started

Log in to AI Pass and copy the `Cookie` header from any request to `de.aipass.net`. It must contain `__Secure-ai_passport_auth.session_token`. The [dashboard](apps/dashboard) shows each click and accepts the header, the token alone, or a **Copy as cURL**.

Send the cookie as the API key:

```bash
curl -sN localhost:3001/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AIPASS_COOKIE" \
  -d '{"model":"claude-sonnet-5@azure",
       "messages":[{"role":"user","content":"hi"}]}'
```

`gemini-3.5-flash-lite` is free. `GET /v1/models` lists the rest.

## Connect a client

Every client takes a base URL, the cookie as its key, and a model ID. The dashboard’s **Integrations** page writes each setup out with your values filled in:

| Client        | Base URL                   | Key                        |
| ------------- | -------------------------- | -------------------------- |
| Claude Code   | `http://127.0.0.1:3001`    | `ANTHROPIC_AUTH_TOKEN`     |
| Anthropic SDK | `http://127.0.0.1:3001/v1` | `ANTHROPIC_API_KEY`        |
| OpenAI SDK    | `http://127.0.0.1:3001/v1` | `apiKey`                   |
| Codex         | `http://127.0.0.1:3001/v1` | `env_key` in `config.toml` |

A deployment with `THAIPASS_TOKEN_KEY` also issues scoped `tp_v1_…` tokens, so an app never holds the raw cookie. Run `bun run login` to get one.

## Documentation

The [guide](docs/guide.md) covers each client, login with thaipass, attachments, media, tool calling, credits, the LMS learner, deployment to Vercel, and troubleshooting by status code. A running proxy serves its OpenAPI reference at `/`.

## Development

The repo is a Bun workspace run by Turborepo:

- `apps/proxy`: the server and the LMS command
- `apps/dashboard`: the Next.js dashboard
- `packages/core`: the AI Pass protocol shared by the server and the provider
- `packages/thaipass`: the AI SDK provider published to npm

Run `bun run dev` for watch mode, `bun run test` for the suites, and `bun run check` before you commit.

## Personal use only

thaipass is a reverse-engineered adapter over an undocumented private API. Keep it to one account you own, and don’t run it as a service for other people. That’s a request, not a licence term.

## License

[MIT](LICENSE)
