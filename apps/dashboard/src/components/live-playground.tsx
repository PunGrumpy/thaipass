"use client";

import { Clock, Loader2, Play, Send, Square, Terminal } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface LivePlaygroundProps {
  cookie: string;
  onModelChange: (model: string) => void;
  proxyUrl: string;
  selectedModel: string;
}

interface StreamProcessorParams {
  onFirstToken: () => void;
  onToken: (token: string) => void;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}

const processStream = async ({
  onFirstToken,
  onToken,
  reader,
}: StreamProcessorParams): Promise<void> => {
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedFirst = false;

  const readStep = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
        continue;
      }

      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === "[DONE]") {
        continue;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          if (!receivedFirst) {
            receivedFirst = true;
            onFirstToken();
          }
          onToken(delta);
        }
      } catch {
        void 0;
      }
    }

    return readStep();
  };

  await readStep();
};

export const LivePlayground = ({
  cookie,
  onModelChange,
  proxyUrl,
  selectedModel,
}: LivePlaygroundProps) => {
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [userPrompt, setUserPrompt] = useState(
    "Explain the concept of monorepos in three concise bullet points."
  );
  const [output, setOutput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [ttft, setTtft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleRun = async () => {
    if (!cookie) {
      toast.error(
        "Please enter your AI Pass session cookie in the Quota section."
      );
      return;
    }

    if (!userPrompt.trim()) {
      toast.error("User prompt cannot be empty.");
      return;
    }

    setIsStreaming(true);
    setOutput("");
    setTtft(null);
    setTotalTime(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startTime = performance.now();

    try {
      const messages = [];
      if (systemPrompt.trim()) {
        messages.push({ content: systemPrompt.trim(), role: "system" });
      }
      messages.push({ content: userPrompt.trim(), role: "user" });

      const res = await fetch(`${proxyUrl}/v1/chat/completions`, {
        body: JSON.stringify({
          messages,
          model: selectedModel,
          stream: true,
        }),
        headers: {
          Authorization: `Bearer ${cookie}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(
          errorJson.error?.message || `HTTP ${res.status}: Proxy request failed`
        );
      }

      if (!res.body) {
        throw new Error("No response body received from stream.");
      }

      await processStream({
        onFirstToken: () => {
          setTtft(Math.round(performance.now() - startTime));
        },
        onToken: (delta) => {
          setOutput((prev) => prev + delta);
        },
        reader: res.body.getReader(),
      });

      setTotalTime(Math.round(performance.now() - startTime));
      toast.success("Completion finished successfully.");
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        toast.info("Request cancelled.");
      } else {
        const msg =
          error instanceof Error ? error.message : "Error during completion";
        toast.error(msg);
        setOutput((prev) =>
          prev ? `${prev}\n\n[Error: ${msg}]` : `[Error: ${msg}]`
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4 text-emerald-400" />
              Live Proxy Playground
            </CardTitle>
            <CardDescription className="text-xs">
              Test prompts directly through your local proxy with streaming SSE.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              Model:
            </span>
            <Input
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="bg-background/80 h-8 w-56 font-mono text-xs"
              placeholder="Model id..."
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-medium">
                System Prompt (Optional)
              </label>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                className="bg-background/50 resize-none font-mono text-xs"
                placeholder="System instructions..."
              />
            </div>

            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-medium">
                User Prompt
              </label>
              <Textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                rows={5}
                className="bg-background/50 font-mono text-xs"
                placeholder="Enter prompt to send..."
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                {ttft !== null && (
                  <Badge
                    variant="outline"
                    className="border-border/80 gap-1 font-mono text-[10px]"
                  >
                    <Clock className="h-2.5 w-2.5 text-blue-400" /> TTFT: {ttft}
                    ms
                  </Badge>
                )}
                {totalTime !== null && (
                  <Badge
                    variant="outline"
                    className="border-border/80 gap-1 font-mono text-[10px]"
                  >
                    Total: {totalTime}ms
                  </Badge>
                )}
              </div>

              {isStreaming ? (
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  onClick={handleRun}
                  size="sm"
                  className="h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-500"
                >
                  <Send className="h-3 w-3" />
                  <span>Run Prompt</span>
                </Button>
              )}
            </div>
          </div>

          <div className="border-border/60 bg-background/40 flex min-h-[220px] flex-col rounded-lg border p-3.5">
            <div className="border-border/40 mb-2 flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px]">
                <Terminal className="h-3 w-3 text-emerald-400" />
                Stream Output
              </span>
              {isStreaming && (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Streaming
                </span>
              )}
            </div>

            <div className="text-foreground/90 max-h-[300px] flex-1 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {output || (
                <span className="text-muted-foreground/60 italic">
                  Press &quot;Run Prompt&quot; to test your configuration.
                  Output will stream here in real time.
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
