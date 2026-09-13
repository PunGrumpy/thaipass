"use client";

import { useI18n } from "@thaipass/internationalization";
import type { Dictionary } from "@thaipass/internationalization";
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
import { fill, formatDuration, formatPercent, pluralize } from "@/lib/format";
import {
  checkRun,
  DEFAULT_RUN_OPTIONS,
  MAX_COURSES,
  MAX_LESSONS,
} from "@/lib/learn-run";
import type { RunField, RunOptions } from "@/lib/learn-run";
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

/** The one line under the button that answers "how long will this take". */
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
  /** A settings change the press writes as well as runs. */
  over?: Partial<RunOptions>;
}

const headlineOf = (
  monthly: number | null,
  amount: number,
  copy: Dictionary["learning"]["run"]
): string =>
  monthly === null
    ? copy.title
    : fill(copy.headline, monthly.toLocaleString(), amount.toLocaleString());

/** The fine print under the button, which says the goal itself. */
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

/**
 * What the one button offers, in the words of the outcome rather than the
 * form. Reaching a target the period already holds ends after a single read,
 * so that case offers to earn instead of doing nothing convincingly.
 */
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
      setInvalid({
        field: check.field,
        message: invalidMessage(check.field, copy.invalid),
      });
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

  const offer = offerOf({
    confirming,
    copy: copy.goal,
    monthly,
    options,
    paused,
  });

  return (
    <section aria-labelledby="run-heading" className="max-w-2xl space-y-4">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold tracking-tight tabular-nums"
          id="run-heading"
        >
          {headlineOf(monthly, options.amount, copy)}
        </h2>

        {share === null ? null : (
          <Progress className="gap-1" value={share}>
            <ProgressLabel className="text-muted-foreground text-sm font-normal">
              {met ? copy.met : fill(copy.toGo, (gap ?? 0).toLocaleString())}
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
            {copy.settings}
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
                {copy.stop}
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
    </section>
  );
};
