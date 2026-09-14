"use client";

import { useI18n } from "@thaipass/internationalization";
import { Eraser, Send, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { StopIcon } from "@/components/icons/rune";
import { Metric } from "@/components/playground/metric";
import { ModelCard } from "@/components/playground/model-card";
import { ModelPicker } from "@/components/playground/model-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const { t } = useI18n();
  const copy = t.playground.metrics;

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
          label={copy.tokens}
          unit="tok"
          value={total_tokens ?? null}
        />
      ) : null}
      {Number.isFinite(credits?.spent) ? (
        <Metric
          hint={`Used: ${credits?.used.toLocaleString()} / ${credits?.limit.toLocaleString()}`}
          label={copy.credits}
          unit="credits"
          value={credits?.spent ?? null}
        />
      ) : null}
      {Number.isFinite(cost) ? (
        <Metric
          formatted={formatUsd(cost ?? 0)}
          hint={copy.costHint}
          label={copy.cost}
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
}: PlaygroundStreamMetricsProps) => {
  const { t } = useI18n();
  const copy = t.playground.metrics;

  return (
    <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 border-t px-4 py-2.5 text-sm">
      <Metric label={copy.firstToken} unit="ms" value={timings.ttft} />
      <Metric label={copy.total} unit="ms" value={timings.total} />
      <Metric label={copy.throughput} unit="ch/s" value={charsPerSecond} />
      <UsageMetrics usage={usage} />
    </div>
  );
};

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

export const Playground = ({
  initialModel,
}: {
  readonly initialModel: string | null;
}) => {
  const { cookie, hasSession, proxyUrl } = useConnection();
  const { models } = useCatalog();
  const { t } = useI18n();
  const copy = t.playground;

  const chatModels = useMemo(
    () => models.filter((entry) => entry.kind === "chat"),
    [models]
  );

  const [model, setModel] = useState(initialModel ?? DEFAULT_MODEL);
  const [system, setSystem] = useState("You are a concise assistant.");
  const [prompt, setPrompt] = useState("");
  const [sent, setSent] = useState("");
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [timings, setTimings] = useState<Timings>(NO_TIMINGS);
  const [usage, setUsage] = useState<CompletionUsage | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const selected = chatModels.find((entry) => entry.id === model) ?? null;
  const empty = sent === "" && output === "";

  useEffect(() => {
    const node = outputRef.current;
    if (node) {
      node.scrollTo({ top: node.scrollHeight });
    }
  }, []);

  useEffect(() => {
    const controller = abortRef;
    return () => controller.current?.abort();
  }, []);

  const handleRun = async () => {
    if (!hasSession) {
      toast.error(copy.needsSession);
      return;
    }
    if (prompt.trim() === "") {
      toast.error(copy.emptyPrompt);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();

    setStreaming(true);
    setSent(prompt.trim());
    setPrompt("");
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

    if (!controller.signal.aborted) {
      toast.error(outcome.message);
      setOutput((previous) => `${previous}\n\n[error] ${outcome.message}`);
    }
  };

  const handleClear = () => {
    setSent("");
    setOutput("");
    setTimings(NO_TIMINGS);
    setUsage(null);
  };

  const elapsedSeconds =
    timings.total === null ? 0 : timings.total / MS_PER_SECOND;
  const charsPerSecond =
    elapsedSeconds > 0 ? Math.round(output.length / elapsedSeconds) : null;

  return (
    <div className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <ModelPicker models={chatModels} onChange={setModel} value={model} />

        <div className="ml-auto flex items-center gap-1">
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label={copy.settings.label}
                  className="size-8"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <Settings2 className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-2">
              <Label htmlFor="playground-system">{copy.settings.system}</Label>
              <Textarea
                className="min-h-24 text-sm"
                id="playground-system"
                onChange={(event) => setSystem(event.target.value)}
                value={system}
              />
              <p className="text-muted-foreground text-xs">
                {copy.settings.systemHint}
              </p>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={copy.reset}
                  className="size-8"
                  disabled={empty || streaming}
                  onClick={handleClear}
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <Eraser className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{copy.reset}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-smooth p-4" ref={outputRef}>
        {empty && selected ? (
          <div className="flex h-full items-center justify-center">
            <ModelCard model={selected} />
          </div>
        ) : null}

        {empty ? null : (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex justify-end">
              <p className="bg-muted max-w-[85%] rounded-xl px-3.5 py-2 text-sm whitespace-pre-wrap">
                {sent}
              </p>
            </div>
            <div className="text-sm whitespace-pre-wrap">
              {output}
              {streaming && output === "" ? (
                <span className="text-muted-foreground">
                  {t.common.loading}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {empty ? null : (
        <PlaygroundStreamMetrics
          charsPerSecond={charsPerSecond}
          timings={timings}
          usage={usage}
        />
      )}

      <form
        className="flex shrink-0 items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleRun();
        }}
      >
        <Textarea
          aria-label={copy.composer.placeholder}
          className="max-h-40 min-h-11 flex-1 resize-none text-base sm:text-sm"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleRun();
            }
          }}
          placeholder={
            hasSession ? copy.composer.placeholder : copy.composer.needsSession
          }
          value={prompt}
        />

        {streaming ? (
          <Button
            aria-label={copy.composer.stop}
            className="size-11 sm:size-9"
            onClick={() => abortRef.current?.abort()}
            size="icon"
            type="button"
            variant="outline"
          >
            <StopIcon className="size-4" />
          </Button>
        ) : (
          <Button
            aria-label={copy.composer.send}
            className="size-11 sm:size-9"
            disabled={!hasSession || prompt.trim() === ""}
            size="icon"
            type="submit"
          >
            <Send className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
};
