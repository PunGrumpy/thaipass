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

export interface Snippet {
  code: (params: SnippetParams) => string;
  filename: string;
  hint: string;
  id: string;
  label: string;
  language: SnippetLanguage;
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
    hint: "Export these before launching Claude Code; the small fast model is the free one, so background turns cost nothing.",
    id: "claude-code",
    label: "Claude Code",
    language: "bash",
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
    hint: 'Codex speaks only the Responses protocol, so the provider points at /v1 with wire_api = "responses" and reads the credential from the environment variable it names. It resends the whole conversation every turn and opens with a large instructions block, which is the shape the AI Pass edge refuses most: a first 400 usually means the prompt, not the setup.',
    id: "codex",
    label: "Codex",
    language: "toml",
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
    hint: "Add under Cursor → Settings → Models → custom OpenAI-compatible provider.",
    id: "cursor",
    label: "Cursor",
    language: "json",
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
    hint: "Cline reads the Anthropic-compatible surface at /v1/messages.",
    id: "cline",
    label: "Cline",
    language: "json",
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
    hint: "The provider calls AI Pass directly, so no proxy process is needed — and so it takes the cookie, unless the process also holds the THAIPASS_TOKEN_KEY that opens a token.",
    id: "ai-sdk",
    label: "AI SDK",
    language: "tsx",
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
    hint: "Any OpenAI-compatible SDK works the same way: swap the base URL and the key.",
    id: "openai-sdk",
    label: "OpenAI SDK",
    language: "tsx",
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
    hint: "The fastest check that the gateway and the credential both work.",
    id: "curl",
    label: "cURL",
    language: "bash",
    target: "gateway",
  },
];
