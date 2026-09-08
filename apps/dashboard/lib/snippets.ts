import { FREE_MODEL } from "./catalog";

export interface SnippetParams {
  cookie: string;
  model: string;
  proxyUrl: string;
}

export type SnippetLanguage = "bash" | "json" | "tsx";

export interface Snippet {
  code: (params: SnippetParams) => string;
  filename: string;
  hint: string;
  id: string;
  label: string;
  language: SnippetLanguage;
}

export const COOKIE_PLACEHOLDER = "<YOUR_AIPASS_COOKIE>";

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
    hint: "The provider calls AI Pass directly, so no proxy process is needed.",
    id: "ai-sdk",
    label: "AI SDK",
    language: "tsx",
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
    hint: "The fastest check that the gateway and the cookie both work.",
    id: "curl",
    label: "cURL",
    language: "bash",
  },
];
