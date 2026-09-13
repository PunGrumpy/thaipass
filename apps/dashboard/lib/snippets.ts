import { FREE_MODEL } from "./catalog";

export interface SnippetParams {
  /** The credential the snippet carries: a thaipass token, or the cookie. */
  cookie: string;
  model: string;
  proxyUrl: string;
}

export type SnippetLanguage = "bash" | "json" | "toml" | "tsx";

/**
 * Where the credential in a snippet is spent. A client that calls this
 * gateway can carry a thaipass token; one that calls AI Pass itself needs the
 * cookie, because only the gateway holds the key that opens a token.
 */
export type SnippetTarget = "gateway" | "upstream";

/**
 * One instruction in a setup. Exactly one step carries the code, because a
 * reader following a list wants to know where the block lands before they copy
 * it, and what to do once they have.
 */
export interface SnippetStep {
  /** True on the step the code block belongs under. */
  readonly code?: boolean;
  /** Backticked runs are painted as code where this is rendered. */
  readonly text: string;
}

/** Where a snippet is spent, which is what the drawing beside the steps shows. */
export type SnippetPlace =
  | { readonly kind: "file"; readonly name: string }
  | { readonly kind: "settings"; readonly app: string }
  | { readonly kind: "terminal"; readonly run: string };

export interface Snippet {
  code: (params: SnippetParams) => string;
  filename: string;
  id: string;
  label: string;
  language: SnippetLanguage;
  place: SnippetPlace;
  steps: readonly SnippetStep[];
  /** One line, before the steps: what this sets up. */
  summary: string;
  target: SnippetTarget;
}

export const COOKIE_PLACEHOLDER = "<YOUR_AIPASS_COOKIE>";
export const TOKEN_PLACEHOLDER = "<YOUR_THAIPASS_TOKEN>";

/** What a client actually calls: completions, and the catalogue behind a picker. */
export const CLIENT_SCOPE = "chat models";

export const SNIPPETS: readonly Snippet[] = [
  {
    code: ({
      cookie,
      model,
      proxyUrl,
    }) => `export ANTHROPIC_BASE_URL="${proxyUrl}"
export ANTHROPIC_AUTH_TOKEN="${cookie}"
export ANTHROPIC_MODEL="${model}"
export ANTHROPIC_SMALL_FAST_MODEL="${FREE_MODEL}"

claude`,
    filename: ".envrc",
    id: "claude-code",
    label: "Claude Code",
    language: "bash",
    place: { kind: "terminal", run: "claude" },
    steps: [
      {
        code: true,
        text: "Save this as `.envrc` where you work, or paste it into the shell you will run Claude Code from.",
      },
      {
        text: "Run `claude` there. The small fast model is the free one, so background turns cost nothing.",
      },
    ],
    summary: "Claude Code, talking to the gateway over the Anthropic protocol.",
    target: "gateway",
  },
  {
    code: ({ cookie, model, proxyUrl }) => `# 1. In the shell that runs codex:
#    export AIPASS_COOKIE="${cookie}"
#
# 2. In ~/.codex/config.toml:
model = "${model}"
model_provider = "thaipass"

[model_providers.thaipass]
name = "thaipass"
base_url = "${proxyUrl}/v1"
wire_api = "responses"
env_key = "AIPASS_COOKIE"`,
    filename: "~/.codex/config.toml",
    id: "codex",
    label: "Codex",
    language: "toml",
    place: { kind: "terminal", run: "codex" },
    steps: [
      {
        code: true,
        text: "Export the credential, then put the provider block in `~/.codex/config.toml`.",
      },
      {
        text: "Run `codex`. It resends the whole conversation every turn, so one session can spend the day's credits.",
      },
      {
        text: "A first request that comes back 400 is the AI Pass edge refusing the prompt shape, not a mistake in this setup.",
      },
    ],
    summary: "Codex, which speaks only the Responses protocol.",
    target: "gateway",
  },
  {
    code: ({ cookie, model, proxyUrl }) => `{
  "models": [
    {
      "apiKey": "${cookie}",
      "baseUrl": "${proxyUrl}/v1",
      "model": "${model}",
      "provider": "anthropic",
      "title": "${model}"
    }
  ]
}`,
    filename: "cursor-settings.json",
    id: "cursor",
    label: "Cursor",
    language: "json",
    place: { app: "Cursor", kind: "settings" },
    steps: [
      {
        text: "Open Cursor → Settings → Models, and add a custom OpenAI-compatible provider.",
      },
      { code: true, text: "Paste these values into it." },
      { text: "Pick the model in Cursor's own picker, by the same id." },
    ],
    summary: "Cursor, through its custom model provider.",
    target: "gateway",
  },
  {
    code: ({ cookie, model, proxyUrl }) => `{
  "anthropicBaseUrl": "${proxyUrl}/v1",
  "apiKey": "${cookie}",
  "apiModelId": "${model}",
  "apiProvider": "anthropic"
}`,
    filename: "cline-provider.json",
    id: "cline",
    label: "Cline",
    language: "json",
    place: { app: "Cline", kind: "settings" },
    steps: [
      {
        text: "Open Cline → Settings, and choose Anthropic as the API provider.",
      },
      {
        code: true,
        text: "Fill the base URL, the key and the model id with these.",
      },
    ],
    summary: "Cline, on the Anthropic-compatible surface at /v1/messages.",
    target: "gateway",
  },
  {
    code: ({ cookie, model }) => `import { streamText } from "ai";
import { createAipass } from "thaipass";

const aipass = createAipass({ cookie: "${cookie}" });

const result = streamText({
  model: aipass("${model}"),
  prompt: "Explain how an HTTP proxy works.",
});

for await (const delta of result.textStream) {
  process.stdout.write(delta);
}`,
    filename: "stream.ts",
    id: "ai-sdk",
    label: "AI SDK",
    language: "tsx",
    place: { kind: "file", name: "stream.ts" },
    steps: [
      { text: "Install it: `bun add thaipass ai`." },
      { code: true, text: "Give it your cookie, and stream." },
      {
        text: "A thaipass token works here only when the same process holds the `THAIPASS_TOKEN_KEY` that sealed it, since nothing else can open one.",
      },
    ],
    summary:
      "The AI SDK provider, which calls AI Pass with no gateway in between.",
    target: "upstream",
  },
  {
    code: ({ cookie, model, proxyUrl }) => `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${cookie}",
  baseURL: "${proxyUrl}/v1",
});

const completion = await client.chat.completions.create({
  messages: [{ content: "Hello from thaipass!", role: "user" }],
  model: "${model}",
  stream: true,
});

for await (const chunk of completion) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
    filename: "client.ts",
    id: "openai-sdk",
    label: "OpenAI SDK",
    language: "tsx",
    place: { kind: "file", name: "client.ts" },
    steps: [
      { text: "Install it: `bun add openai`." },
      { code: true, text: "Point it at the gateway." },
    ],
    summary:
      "Any OpenAI-compatible SDK: the base URL and the key are all that change.",
    target: "gateway",
  },
  {
    code: ({
      cookie,
      model,
      proxyUrl,
    }) => `curl -sN ${proxyUrl}/v1/chat/completions \\
  -H "content-type: application/json" \\
  -H "authorization: Bearer ${cookie}" \\
  -d '{
    "messages": [{ "content": "Hello!", "role": "user" }],
    "model": "${model}",
    "stream": true
  }'`,
    filename: "smoke-test.sh",
    id: "curl",
    label: "cURL",
    language: "bash",
    place: { kind: "terminal", run: "curl -sN …/v1/chat/completions" },
    steps: [
      { code: true, text: "Paste this into a terminal." },
      {
        text: "Text streams back as it is generated. A 401 means the credential; a 400 usually means the prompt.",
      },
    ],
    summary: "The fastest check that the gateway and the credential both work.",
    target: "gateway",
  },
];
