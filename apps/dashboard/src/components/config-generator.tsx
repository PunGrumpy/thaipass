"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ConfigGeneratorProps {
  cookie: string;
  proxyUrl: string;
  selectedModel: string;
}

export const ConfigGenerator = ({
  cookie,
  proxyUrl,
  selectedModel,
}: ConfigGeneratorProps) => {
  const [model, setModel] = useState(
    selectedModel || "claude-sonnet-5@default"
  );
  const cookieDisplay = cookie || "<YOUR_AIPASS_COOKIE>";

  const claudeCodeSnippet = `# Run in your terminal before launching Claude Code
export ANTHROPIC_BASE_URL="${proxyUrl}"
export ANTHROPIC_AUTH_TOKEN="${cookieDisplay}"
export ANTHROPIC_MODEL="${model}"
export ANTHROPIC_SMALL_FAST_MODEL="gemini-3.1-flash-lite"

# Then run:
claude`;

  const cursorSnippet = `{
  "models": [
    {
      "apiKey": "${cookieDisplay}",
      "baseUrl": "${proxyUrl}/v1",
      "model": "${model}",
      "provider": "anthropic",
      "title": "${model}"
    }
  ]
}`;

  const clineSnippet = `{
  "anthropicBaseUrl": "${proxyUrl}/v1",
  "apiKey": "${cookieDisplay}",
  "apiModelId": "${model}",
  "apiProvider": "anthropic"
}`;

  const aiSdkSnippet = `import { streamText } from "ai";
import { createAipass } from "thaipass";

const aipass = createAipass({
  cookie: "${cookieDisplay}",
});

const result = streamText({
  model: aipass("${model}"),
  prompt: "Explain how quantum computing works in simple terms.",
});

for await (const delta of result.textStream) {
  process.stdout.write(delta);
}`;

  const openaiSnippet = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${cookieDisplay}",
  baseURL: "${proxyUrl}/v1",
});

const completion = await client.chat.completions.create({
  messages: [{ content: "Hello from Thaipass!", role: "user" }],
  model: "${model}",
  stream: true,
});

for await (const chunk of completion) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}`;

  const curlSnippet = `curl -sN ${proxyUrl}/v1/chat/completions \\
  -H "content-type: application/json" \\
  -H "authorization: Bearer ${cookieDisplay}" \\
  -d '{
    "messages": [
      { "content": "Hello!", "role": "user" }
    ],
    "model": "${model}",
    "stream": true
  }'`;

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-blue-400" />
              Client Integration Configurator
            </CardTitle>
            <CardDescription className="text-xs">
              Instantly configure your coding tools and developer SDKs with your
              local proxy.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              Active Model:
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border-border/80 bg-background/80 text-foreground focus:ring-primary h-8 rounded-md border px-2.5 font-mono text-xs focus:ring-1 focus:outline-none"
            >
              <option value="claude-sonnet-5@default">
                claude-sonnet-5@default
              </option>
              <option value="gemini-3.1-flash-lite">
                gemini-3.1-flash-lite (Free)
              </option>
              <option value="gpt-5.6-terra">gpt-5.6-terra</option>
              <option value="grok-4.3">grok-4.3</option>
              <option value="DeepSeek-V3.2">DeepSeek-V3.2</option>
              <option value="sonar-deep-research">sonar-deep-research</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="claude-code" className="w-full">
          <TabsList className="bg-secondary/60 mb-3 grid h-9 w-full grid-cols-3 p-1 sm:grid-cols-6">
            <TabsTrigger value="claude-code" className="text-xs">
              Claude Code
            </TabsTrigger>
            <TabsTrigger value="cursor" className="text-xs">
              Cursor
            </TabsTrigger>
            <TabsTrigger value="cline" className="text-xs">
              Cline
            </TabsTrigger>
            <TabsTrigger value="ai-sdk" className="text-xs">
              AI SDK
            </TabsTrigger>
            <TabsTrigger value="openai-sdk" className="text-xs">
              OpenAI SDK
            </TabsTrigger>
            <TabsTrigger value="curl" className="text-xs">
              cURL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claude-code" className="mt-0">
            <CodeBlock
              code={claudeCodeSnippet}
              language="bash"
              filename="Terminal (.envrc / bash)"
              showCopyButton
            />
          </TabsContent>

          <TabsContent value="cursor" className="mt-0">
            <CodeBlock
              code={cursorSnippet}
              language="json"
              filename="Cursor Config"
              showCopyButton
            />
          </TabsContent>

          <TabsContent value="cline" className="mt-0">
            <CodeBlock
              code={clineSnippet}
              language="json"
              filename="Cline Provider Settings"
              showCopyButton
            />
          </TabsContent>

          <TabsContent value="ai-sdk" className="mt-0">
            <CodeBlock
              code={aiSdkSnippet}
              language="tsx"
              filename="ai-sdk-example.ts"
              showCopyButton
            />
          </TabsContent>

          <TabsContent value="openai-sdk" className="mt-0">
            <CodeBlock
              code={openaiSnippet}
              language="tsx"
              filename="openai-client.ts"
              showCopyButton
            />
          </TabsContent>

          <TabsContent value="curl" className="mt-0">
            <CodeBlock
              code={curlSnippet}
              language="bash"
              filename="curl-test.sh"
              showCopyButton
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
