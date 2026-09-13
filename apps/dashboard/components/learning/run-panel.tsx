"use client";

import { ChevronDown, Eraser, Play, Square } from "lucide-react";
import { useState } from "react";

import { RunSettings } from "@/components/learning/run-settings";
import type { Invalid } from "@/components/learning/run-settings";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { useCatalog } from "@/hooks/use-gateway";
import { formatDuration, formatPercent, formatPlural } from "@/lib/format";
import { checkRun, DEFAULT_RUN_OPTIONS, describeLimits } from "@/lib/learn-run";
import type { RunOptions } from "@/lib/learn-run";
import type { LearnRunBody } from "@/lib/lms";

const CHAT_KIND = "chat";

/** What the last check found, so the button can say what pressing it costs. */
export interface RunEstimate {
  lessons: number;
  seconds: number;
}

export interface RunPanelProps {
  canClear: boolean;
  estimate: RunEstimate | null;
  hasSession: boolean;
  /** This period's EXP, which is what the headline and the button count from. */
  monthly: number | null;
  onClear: () => void;
  onStart: (body: LearnRunBody) => void;
  onStop: () => void;
  /** The last run stopped at its time budget, so the next one picks up from there. */
  paused: boolean;
  running: boolean;
}

interface Offer {
  label: string;
  /** A settings change the press writes as well as runs. */
  over?: Partial<RunOptions>;
}

const headlineOf = (monthly: number | null, amount: number): string =>
  monthly === null
    ? "Earn EXP"
    : `${monthly.toLocaleString()} of ${amount.toLocaleString()} EXP this month`;

/**
 * What the one button offers, in the words of the outcome rather than the
 * form. Reaching a target the period already holds ends after a single read,
 * so that case offers to earn instead of doing nothing convincingly.
 */
const offerOf = ({
  confirming,
  monthly,
  options,
  paused,
}: {
  confirming: boolean;
  monthly: number | null;
  options: RunOptions;
  paused: boolean;
}): Offer => {
  if (confirming) {
    return { label: "Yes, answer the quizzes" };
  }
  if (paused) {
    return { label: "Carry on where it stopped" };
  }
  if (options.goal === "earn") {
    return { label: `Earn ${options.amount.toLocaleString()} more EXP` };
  }
  if (monthly === null) {
    return { label: "Start learning" };
  }
  const gap = options.amount - monthly;
  if (gap <= 0) {
    return {
      label: `Earn another ${options.amount.toLocaleString()} EXP`,
      over: { goal: "earn" },
    };
  }
  return { label: `Earn the remaining ${gap.toLocaleString()} EXP` };
};

/**
 * The run is the one thing on this page that changes the account. Its defaults
 * are a working run on their own, so what the settings add up to is stated in a
 * line and the fields themselves fold away — Start is one press from the
 * heading, and reading six controls is a choice rather than a toll. A failed
 * check opens the panel, since a message under a folded field helps nobody.
 * Quizzes are the only irreversible part and the only option that asks twice.
 */
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
  const [options, setOptions] = useState<RunOptions>(DEFAULT_RUN_OPTIONS);
  const [invalid, setInvalid] = useState<Invalid | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const chatModels = models.filter((model) => model.kind === CHAT_KIND);

  const patch = (next: Partial<RunOptions>) => {
    setOptions((previous) => ({ ...previous, ...next }));
    setConfirming(false);
  };

  /*
   * `over` is how the one button changes the goal it offers: reaching a target
   * means nothing once the period already holds it, so the press that says
   * "Earn another 100" writes that choice into the settings as well as running
   * it, rather than doing something the panel does not show.
   */
  const submit = (dryRun: boolean, over?: Partial<RunOptions>) => {
    const wanted = over ? { ...options, ...over } : options;
    if (over) {
      setOptions(wanted);
    }
    const check = checkRun(wanted, dryRun);
    if (!check.ok) {
      setInvalid({ field: check.field, message: check.message });
      return;
    }
    setInvalid(null);

    // Off by default, so turning it on is deliberate; spending an attempt for
    // good still deserves the second press.
    if (!dryRun && wanted.quiz && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onStart(check.body);
  };

  const gap = monthly === null ? null : options.amount - monthly;
  const share =
    monthly === null
      ? null
      : formatPercent(monthly, Math.max(1, options.amount));
  const met = options.goal === "target" && gap !== null && gap <= 0;

  const offer = offerOf({ confirming, monthly, options, paused });

  return (
    <section aria-labelledby="run-heading" className="max-w-2xl space-y-4">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold tracking-tight tabular-nums"
          id="run-heading"
        >
          {headlineOf(monthly, options.amount)}
        </h2>

        {share === null ? null : (
          <Progress className="gap-1" value={share}>
            <ProgressLabel className="text-muted-foreground text-sm font-normal">
              {met
                ? "You have reached this month's target."
                : `${(gap ?? 0).toLocaleString()} to go`}
            </ProgressLabel>
          </Progress>
        )}
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        <Collapsible
          className="border-t"
          onOpenChange={setSettingsOpen}
          open={settingsOpen || invalid !== null}
        >
          <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-md py-2 text-sm outline-none focus-visible:ring-3">
            <ChevronDown className="size-4 transition-transform group-aria-expanded:rotate-180" />
            Run settings
          </CollapsibleTrigger>

          {/* A run carries the body it was started with, so a field changed
              half way through would look live and do nothing. */}
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
              /*
               * React reuses this node for the submit button below, so by the
               * time the browser acts on the click its type has become "submit"
               * and the form would run again. Cancelling the default is what
               * keeps Stop from starting a second run.
               */
              <Button
                onClick={(event) => {
                  event.preventDefault();
                  onStop();
                }}
                size="lg"
                type="button"
                variant="outline"
              >
                <Square />
                Stop
              </Button>
            ) : (
              <Button
                disabled={!hasSession}
                onClick={() => submit(false, offer.over)}
                size="lg"
                type="button"
              >
                <Play />
                {offer.label}
              </Button>
            )}

            {confirming && !running ? (
              <Button
                onClick={() => setConfirming(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            ) : null}

            {canClear && !running ? (
              <Button onClick={onClear} type="button" variant="ghost">
                <Eraser />
                Clear
              </Button>
            ) : null}

            {hasSession ? null : (
              <span className="text-muted-foreground text-xs">
                Needs a session cookie
              </span>
            )}
          </div>

          {/* The one unknown worth answering before a press that can run for
              hours: how many lessons, and how much video. */}
          {estimate === null ? (
            <Button
              className="h-auto p-0"
              disabled={!hasSession || running}
              onClick={() => submit(true)}
              type="button"
              variant="link"
            >
              See what it would take first
            </Button>
          ) : (
            <p className="text-sm">
              {`Last check: ${formatPlural(estimate.lessons, "lesson")}`}
              {estimate.seconds > 0
                ? `, about ${formatDuration(estimate.seconds / options.pace)} of video`
                : ""}
              {". "}
              <Button
                className="h-auto p-0"
                disabled={!hasSession || running}
                onClick={() => submit(true)}
                type="button"
                variant="link"
              >
                Check again
              </Button>
            </p>
          )}

          <p className="text-muted-foreground text-xs">
            Each lesson is opened and marked done on your account ·{" "}
            {describeLimits(options)}
          </p>
        </div>

        {confirming ? (
          <p className="text-xs">
            This also submits quiz answers, and a quiz attempt cannot be taken
            back. Turn quizzes off under Run settings to leave them alone.
          </p>
        ) : null}
      </form>
    </section>
  );
};
