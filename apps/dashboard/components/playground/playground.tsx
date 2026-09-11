"use client";

import { Eraser, Play, Square, Terminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { StatusDot } from "@/components/layout/status-dot";
import { Metric } from "@/components/playground/metric";
import { ModelSelect } from "@/components/playground/model-select";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConnection } from "@/hooks/use-connection";
import { useCatalog } from "@/hooks/use-gateway";
import { attempt } from "@/lib/attempt";
import { DEFAULT_MODEL } from "@/lib/catalog";
import { formatUsd } from "@/lib/format";
import { streamChatCompletion } from "@/lib/proxy";
import type { ChatMessage, CompletionUsage } from "@/lib/proxy";

const MS_PER_SECOND = 1000;

interface Timings {
  started: number;
  total: number | null;
  ttft: number | null;
}

const NO_TIMINGS: Timings = { started: 0, total: null, ttft: null };

interface PlaygroundStreamMetricsProps {
  charsPerSecond: number | null;
  timings: Timings;
  usage: CompletionUsage | null;
}

interface UsageMetricsProps {
  usage: CompletionUsage | null;
}

const UsageMetrics = ({ usage }: UsageMetricsProps) => {
  if (!usage) {
    return null;
  }

  const { completion_tokens, cost, credits, prompt_tokens, total_tokens } =
    usage;

  return (
    <>
      {Number.isFinite(total_tokens) ? (
        <Metric
          hint={`Prompt: ${prompt_tokens?.toLocaleString() ?? "0"} · Completion: ${completion_tokens?.toLocaleString() ?? "0"}`}
          label="Tokens"
          unit="tok"
          value={total_tokens ?? null}
        />
      ) : null}
      {Number.isFinite(credits?.spent) ? (
        <Metric
          hint={`Used: ${credits?.used.toLocaleString()} / ${credits?.limit.toLocaleString()}`}
          label="Credits"
          unit="credits"
          value={credits?.spent ?? null}
        />
      ) : null}
      {Number.isFinite(cost) ? (
        <Metric
          formatted={formatUsd(cost ?? 0)}
          hint="Estimated market value based on OpenRouter pricing"
          label="Cost (est.)"
          value={cost ?? null}
        />
      ) : null}
    </>
  );
};

const PlaygroundStreamMetrics = ({
  charsPerSecond,
  timings,
  usage,
}: PlaygroundStreamMetricsProps) => (
  <CardDescription className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
    <Metric label="First token" unit="ms" value={timings.ttft} />
    <Metric label="Total" unit="ms" value={timings.total} />
    <Metric label="Throughput" unit="ch/s" value={charsPerSecond} />
    <UsageMetrics usage={usage} />
  </CardDescription>
);

const buildMessages = (system: string, prompt: string): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  const trimmedSystem = system.trim();
  const trimmedPrompt = prompt.trim();
  if (trimmedSystem !== "") {
    messages.push({ content: trimmedSystem, role: "system" });
  }
  messages.push({ content: trimmedPrompt, role: "user" });
  return messages;
};

interface PlaygroundActionsProps {
  hasSession: boolean;
  onAbort: () => void;
  onClear: () => void;
  onRun: () => void;
  outputEmpty: boolean;
  streaming: boolean;
}

const PlaygroundActions = ({
  hasSession,
  onAbort,
  onClear,
  onRun,
  outputEmpty,
  streaming,
}: PlaygroundActionsProps) => (
  <div className="flex items-center gap-2">
    {streaming ? (
      <Button onClick={onAbort} variant="outline">
        <Square />
        Stop
      </Button>
    ) : (
      <Button disabled={!hasSession} onClick={onRun}>
        <Play />
        Run
      </Button>
    )}
    <Button
      disabled={outputEmpty || streaming}
      onClick={onClear}
      variant="ghost"
    >
      <Eraser />
      Clear
    </Button>
    {hasSession ? null : (
      <span className="text-muted-foreground text-xs">
        Needs a session cookie
      </span>
    )}
  </div>
);

export const Playground = ({
  initialModel,
}: {
  readonly initialModel: string | null;
}) => {
  const { cookie, hasSession, proxyUrl } = useConnection();
  const { models } = useCatalog();

  const chatModels = useMemo(
    () => models.filter((model) => model.kind === "chat"),
    [models]
  );

  const [model, setModel] = useState(initialModel ?? DEFAULT_MODEL);
  const [system, setSystem] = useState("You are a concise assistant.");
  const [prompt, setPrompt] = useState(
    "Explain what an HTTP proxy does, in three bullet points."
  );
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [timings, setTimings] = useState<Timings>(NO_TIMINGS);
  const [usage, setUsage] = useState<CompletionUsage | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = outputRef.current;
    if (node && output !== "") {
      node.scrollTo({ top: node.scrollHeight });
    }
  }, [output]);

  useEffect(() => {
    const controller = abortRef;
    // A stream left running after the page changes writes into nothing.
    return () => controller.current?.abort();
  }, []);

  const handleRun = async () => {
    if (!hasSession) {
      toast.error("Add a session cookie in Settings first.");
      return;
    }
    if (prompt.trim() === "") {
      toast.error("The prompt is empty.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();

    setStreaming(true);
    setOutput("");
    setTimings({ ...NO_TIMINGS, started });
    setUsage(null);

    const messages = buildMessages(system, prompt);

    const outcome = await attempt(() =>
      streamChatCompletion({
        cookie,
        messages,
        model,
        onDelta: (delta) => setOutput((previous) => previous + delta),
        onFirstDelta: () =>
          setTimings((previous) => ({
            ...previous,
            ttft: Math.round(performance.now() - started),
          })),
        onUsage: setUsage,
        proxyUrl,
        signal: controller.signal,
      })
    );

    setStreaming(false);
    abortRef.current = null;

    if (outcome.ok) {
      setTimings((previous) => ({
        ...previous,
        total: Math.round(performance.now() - started),
      }));
      return;
    }

    // A user-initiated stop lands here too, and is not worth an error toast.
    if (!controller.signal.aborted) {
      toast.error(outcome.message);
      setOutput((previous) => `${previous}\n\n[error] ${outcome.message}`);
    }
  };

  const elapsedSeconds =
    timings.total === null ? 0 : timings.total / MS_PER_SECOND;
  const charsPerSecond =
    elapsedSeconds > 0 ? Math.round(output.length / elapsedSeconds) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Request</CardTitle>
          <CardDescription>
            Sent to <span className="font-mono">/v1/chat/completions</span> with
            streaming on.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="playground-model">Model</Label>
            <ModelSelect
              id="playground-model"
              models={chatModels}
              onChange={setModel}
              value={model}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="playground-system">System prompt</Label>
            <Textarea
              className="resize-none font-mono text-base sm:text-xs"
              id="playground-system"
              onChange={(event) => setSystem(event.target.value)}
              rows={2}
              value={system}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="playground-prompt">User prompt</Label>
            <Textarea
              className="font-mono text-base sm:text-xs"
              id="playground-prompt"
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              value={prompt}
            />
          </div>

          <PlaygroundActions
            hasSession={hasSession}
            onAbort={() => abortRef.current?.abort()}
            onClear={() => {
              setOutput("");
              setTimings(NO_TIMINGS);
              setUsage(null);
            }}
            onRun={handleRun}
            outputEmpty={output === ""}
            streaming={streaming}
          />
        </CardContent>
      </Card>

      <Card className="min-h-[26rem]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="text-muted-foreground size-4" />
            Stream
            {streaming ? <StatusDot label="Streaming" tone="online" /> : null}
          </CardTitle>
          <PlaygroundStreamMetrics
            charsPerSecond={charsPerSecond}
            timings={timings}
            usage={usage}
          />
        </CardHeader>

        <CardContent className="flex-1">
          <div
            className="max-h-[26rem] scrollbar-thin overflow-y-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap"
            ref={outputRef}
          >
            {output === "" ? (
              <p className="text-muted-foreground/60">
                Run the prompt and the response streams in here, token by token.
              </p>
            ) : (
              output
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
