"use client";

import { useI18n } from "@thaipass/internationalization";
import type { Dictionary } from "@thaipass/internationalization";
import { ChevronDown, Eraser } from "lucide-react";
import { useState } from "react";

import { PlayIcon, StopIcon } from "@/components/icons/rune";
import { RunSettings } from "@/components/learning/run-settings";
import type { Invalid } from "@/components/learning/run-settings";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { useCatalog } from "@/hooks/use-gateway";
import { fill, formatDuration, formatPercent, pluralize } from "@/lib/format";
import {
  checkRun,
  DEFAULT_RUN_OPTIONS,
  MAX_COURSES,
  MAX_LESSONS,
} from "@/lib/learn-run";
import type { RunField, RunOptions } from "@/lib/learn-run";
import { MONTHLY_TARGET } from "@/lib/lms";
import type { LearnRunBody } from "@/lib/lms";

const CHAT_KIND = "chat";

export interface RunEstimate {
  lessons: number;
  seconds: number;
}

export interface RunPanelProps {
  canClear: boolean;
  estimate: RunEstimate | null;
  hasSession: boolean;
  monthly: number | null;
  onClear: () => void;
  onStart: (body: LearnRunBody) => void;
  onStop: () => void;
  paused: boolean;
  running: boolean;
}

const estimateLine = (
  estimate: RunEstimate,
  pace: number,
  copy: Dictionary["learning"]
): string => {
  const lessons = pluralize(estimate.lessons, copy.feed.lessons);
  return estimate.seconds > 0
    ? fill(
        copy.run.estimateVideo,
        lessons,
        formatDuration(estimate.seconds / pace)
      )
    : fill(copy.run.estimate, lessons);
};

const invalidMessage = (
  field: RunField,
  copy: Dictionary["learning"]["run"]["invalid"]
): string => {
  if (field === "amount") {
    return copy.amount;
  }
  if (field === "courses") {
    return fill(copy.courses, MAX_COURSES);
  }
  return fill(copy.maxLessons, MAX_LESSONS);
};

interface Offer {
  label: string;
  over?: Partial<RunOptions>;
}

const limitsOf = (
  options: RunOptions,
  copy: Dictionary["learning"]["run"]["limits"]
): string => {
  const parts = [
    pluralize(options.maxLessons, copy.lessons),
    options.courses.length === 0
      ? copy.every
      : pluralize(options.courses.length, copy.chosen),
    options.pace === 1 ? copy.paceNormal : fill(copy.pace, options.pace),
  ];
  if (!options.attachments) {
    parts.push(copy.attachments);
  }
  if (!options.articles) {
    parts.push(copy.articles);
  }
  if (options.quiz) {
    parts.push(copy.quiz);
  }
  return parts.join(" · ");
};

const offerOf = ({
  confirming,
  copy,
  monthly,
  options,
  paused,
}: {
  confirming: boolean;
  copy: Dictionary["learning"]["run"]["goal"];
  monthly: number | null;
  options: RunOptions;
  paused: boolean;
}): Offer => {
  if (confirming) {
    return { label: copy.confirm };
  }
  if (paused) {
    return { label: copy.resume };
  }
  if (options.goal === "earn") {
    return { label: fill(copy.earn, options.amount.toLocaleString()) };
  }
  if (monthly === null) {
    return { label: copy.start };
  }
  const gap = options.amount - monthly;
  if (gap <= 0) {
    return {
      label: fill(copy.another, options.amount.toLocaleString()),
      over: { goal: "earn" },
    };
  }
  return { label: fill(copy.remaining, gap.toLocaleString()) };
};

export const RunPanel = ({
  canClear,
  estimate,
  hasSession,
  monthly,
  onClear,
  onStart,
  onStop,
  paused,
  running,
}: RunPanelProps) => {
  const { models } = useCatalog();
  const { t } = useI18n();
  const copy = t.learning.run;
  const [options, setOptions] = useState<RunOptions>(DEFAULT_RUN_OPTIONS);
  const [invalid, setInvalid] = useState<Invalid | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const chatModels = models.filter((model) => model.kind === CHAT_KIND);

  const patch = (next: Partial<RunOptions>) => {
    setOptions((previous) => ({ ...previous, ...next }));
    setConfirming(false);
  };

  const submit = (dryRun: boolean, over?: Partial<RunOptions>) => {
    const wanted = over ? { ...options, ...over } : options;
    if (over) {
      setOptions(wanted);
    }
    const check = checkRun(wanted, dryRun);
    if (!check.ok) {
      setInvalid({
        field: check.field,
        message: invalidMessage(check.field, copy.invalid),
      });
      return;
    }
    setInvalid(null);

    if (!dryRun && wanted.quiz && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onStart(check.body);
  };

  // The bar measures the month against the month's target, which is what the
  // headline and the breakdown row both count. `gap` below stays run-scoped,
  // because the button it labels offers to earn a run's worth.
  const monthShare = formatPercent(monthly ?? 0, MONTHLY_TARGET);
  const monthGap = Math.max(0, MONTHLY_TARGET - (monthly ?? 0));
  const monthMet = monthly !== null && monthly >= MONTHLY_TARGET;

  const offer = offerOf({
    confirming,
    copy: copy.goal,
    monthly,
    options,
    paused,
  });

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border">
      <div className="bg-muted/40 space-y-2 border-b px-4 py-3">
        {monthly === null ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            {fill(copy.ofTarget, "—", MONTHLY_TARGET.toLocaleString())}
          </p>
        ) : (
          <>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {fill(copy.headline, monthly.toLocaleString())}
            </p>

            <Progress className="gap-x-4 gap-y-1" value={monthShare}>
              <ProgressLabel className="text-muted-foreground text-sm font-normal">
                {monthMet
                  ? copy.met
                  : fill(copy.toGo, monthGap.toLocaleString())}
              </ProgressLabel>
              <ProgressValue>
                {() =>
                  fill(
                    copy.ofTarget,
                    monthly.toLocaleString(),
                    MONTHLY_TARGET.toLocaleString()
                  )
                }
              </ProgressValue>
            </Progress>
          </>
        )}
      </div>

      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        <Collapsible
          onOpenChange={setSettingsOpen}
          open={settingsOpen || invalid !== null}
        >
          <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-md py-2 text-sm outline-none focus-visible:ring-3">
            <ChevronDown className="size-4 transition-transform group-aria-expanded:rotate-180" />
            {copy.settings}
          </CollapsibleTrigger>

          <CollapsibleContent>
            <RunSettings
              chatModels={chatModels}
              hasSession={hasSession}
              invalid={invalid}
              options={options}
              patch={patch}
              running={running}
            />
          </CollapsibleContent>
        </Collapsible>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Button
                onClick={(event) => {
                  event.preventDefault();
                  onStop();
                }}
                size="lg"
                type="button"
                variant="outline"
              >
                <StopIcon />
                {copy.stop}
              </Button>
            ) : (
              <Button
                disabled={!hasSession}
                onClick={() => submit(false, offer.over)}
                size="lg"
                type="button"
              >
                <PlayIcon />
                {offer.label}
              </Button>
            )}

            {confirming && !running ? (
              <Button
                onClick={() => setConfirming(false)}
                type="button"
                variant="ghost"
              >
                {t.common.actions.cancel}
              </Button>
            ) : null}

            {canClear && !running ? (
              <Button onClick={onClear} type="button" variant="ghost">
                <Eraser />
                {t.common.actions.clear}
              </Button>
            ) : null}

            {hasSession ? null : (
              <span className="text-muted-foreground text-xs">
                {copy.needsSession}
              </span>
            )}
          </div>

          {estimate === null ? (
            <Button
              className="h-auto p-0"
              disabled={!hasSession || running}
              onClick={() => submit(true)}
              type="button"
              variant="link"
            >
              {copy.check}
            </Button>
          ) : (
            <p className="text-sm">
              {estimateLine(estimate, options.pace, t.learning)}{" "}
              <Button
                className="h-auto p-0"
                disabled={!hasSession || running}
                onClick={() => submit(true)}
                type="button"
                variant="link"
              >
                {copy.checkAgain}
              </Button>
            </p>
          )}

          <p className="text-muted-foreground text-xs">
            {`${copy.account} · ${limitsOf(options, copy.limits)}`}
          </p>
        </div>

        {confirming ? <p className="text-xs">{copy.confirm}</p> : null}
      </form>
    </div>
  );
};
