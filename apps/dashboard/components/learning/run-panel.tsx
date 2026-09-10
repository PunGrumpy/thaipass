"use client";

import { ChevronDown, Eraser, Eye, Play, Square } from "lucide-react";
import { useState } from "react";

import { CoursePicker } from "@/components/learning/course-picker";
import { OptionSwitch } from "@/components/learning/option-switch";
import { ModelSelect } from "@/components/playground/model-select";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalog } from "@/hooks/use-gateway";
import {
  checkRun,
  DEFAULT_RUN_OPTIONS,
  MAX_LESSONS,
  PACE_STEPS,
} from "@/lib/learn-run";
import type { RunField, RunGoal, RunOptions } from "@/lib/learn-run";
import type { LearnRunBody } from "@/lib/lms";
import { cn } from "@/lib/utils";

const GOAL_ITEMS: Record<RunGoal, string> = {
  earn: "Earn in this run",
  target: "Reach a period total",
};

const AMOUNT_LABELS: Record<RunGoal, string> = {
  earn: "EXP to earn",
  target: "Period total",
};

const AMOUNT_HINTS: Record<RunGoal, string> = {
  earn: "This run stops once it has earned this much, whatever the period holds.",
  target: "A period that already holds this much ends the run after one read.",
};

const PACE_ITEMS: Record<string, string> = Object.fromEntries(
  PACE_STEPS.map((step) => [String(step), `${step}×`])
);

const CHAT_KIND = "chat";

/** A select can report no value at all; the goal has two states, and one default. */
const asGoal = (value: string | null): RunGoal =>
  value === "earn" ? "earn" : "target";

export interface RunPanelProps {
  canClear: boolean;
  hasSession: boolean;
  onClear: () => void;
  onStart: (body: LearnRunBody) => void;
  onStop: () => void;
  /** The last run stopped at its time budget, so the next one picks up from there. */
  paused: boolean;
  running: boolean;
}

interface Invalid {
  field: RunField;
  message: string;
}

/**
 * The run is the one thing on this page that changes the account, so the two
 * fields that decide how much it does sit in the open and the rest fold away.
 * Quizzes are the only irreversible part and are the only option that asks
 * twice.
 */
export const RunPanel = ({
  canClear,
  hasSession,
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

  const chatModels = models.filter((model) => model.kind === CHAT_KIND);

  const patch = (next: Partial<RunOptions>) => {
    setOptions((previous) => ({ ...previous, ...next }));
    setConfirming(false);
  };

  const submit = (dryRun: boolean) => {
    const check = checkRun(options, dryRun);
    if (!check.ok) {
      setInvalid({ field: check.field, message: check.message });
      return;
    }
    setInvalid(null);

    // Off by default, so turning it on is deliberate; spending an attempt for
    // good still deserves the second press.
    if (!dryRun && options.quiz && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onStart(check.body);
  };

  const errorFor = (field: RunField): string | undefined =>
    invalid?.field === field ? "run-invalid" : undefined;

  const startLabel = (): string => {
    if (confirming) {
      return "Confirm and start";
    }
    return paused ? "Resume run" : "Start run";
  };

  return (
    <section aria-labelledby="run-heading" className="max-w-2xl space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-medium" id="run-heading">
          Earn EXP
        </h2>
        <p className="text-muted-foreground max-w-[68ch] text-sm text-pretty">
          The gateway opens each lesson the way the LMS player does and stamps
          it complete, courses already started first. This changes the account.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        <div className="space-y-1.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="run-goal">Goal</Label>
              <Select
                items={GOAL_ITEMS}
                onValueChange={(next) => patch({ goal: asGoal(next) })}
                value={options.goal}
              >
                <SelectTrigger className="w-full" id="run-goal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="target">{GOAL_ITEMS.target}</SelectItem>
                  <SelectItem value="earn">{GOAL_ITEMS.earn}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="run-amount">{AMOUNT_LABELS[options.goal]}</Label>
              <Input
                aria-describedby={cn("run-amount-hint", errorFor("amount"))}
                aria-invalid={invalid?.field === "amount"}
                className="tabular-nums"
                id="run-amount"
                inputMode="numeric"
                min={1}
                onChange={(event) =>
                  patch({ amount: Number(event.target.value) })
                }
                step={1}
                type="number"
                value={options.amount}
              />
            </div>
          </div>

          {/* The goal and its figure are one decision, so they share one line
              of explanation instead of leaving a gap beside the select. */}
          <p className="text-muted-foreground text-xs" id="run-amount-hint">
            {AMOUNT_HINTS[options.goal]}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="run-pace">Playback speed</Label>
            <Select
              items={PACE_ITEMS}
              onValueChange={(next) => patch({ pace: Number(next) })}
              value={String(options.pace)}
            >
              <SelectTrigger className="w-full" id="run-pace">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACE_STEPS.map((step) => (
                  <SelectItem key={step} value={String(step)}>
                    {PACE_ITEMS[String(step)]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              At 1× a ten-minute video takes ten minutes.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="run-lessons">Lessons per run</Label>
            <Input
              aria-describedby={cn("run-lessons-hint", errorFor("maxLessons"))}
              aria-invalid={invalid?.field === "maxLessons"}
              className="tabular-nums"
              id="run-lessons"
              inputMode="numeric"
              max={MAX_LESSONS}
              min={1}
              onChange={(event) =>
                patch({ maxLessons: Number(event.target.value) })
              }
              step={1}
              type="number"
              value={options.maxLessons}
            />
            <p className="text-muted-foreground text-xs" id="run-lessons-hint">
              The run stops here even if the goal is not met.
            </p>
          </div>
        </div>

        <Collapsible className="border-t pt-2">
          <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-md py-1 text-sm outline-none focus-visible:ring-3">
            <ChevronDown className="size-4 transition-transform group-aria-expanded:rotate-180" />
            More options
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-1 pt-2">
            <div className="space-y-1.5 pb-3">
              <span className="text-sm leading-none font-medium">Courses</span>
              <CoursePicker
                disabled={!hasSession}
                onChange={(courses) => patch({ courses })}
                value={options.courses}
              />
            </div>

            <div className="divide-y border-t">
              <OptionSwitch
                checked={options.attachments}
                description="Marking an attachment read is what earns its EXP."
                label="Read attachments"
                onChange={(next) => patch({ attachments: next })}
              />
              <OptionSwitch
                checked={options.articles}
                description="The same for article lessons."
                label="Read articles"
                onChange={(next) => patch({ articles: next })}
              />
              <OptionSwitch
                checked={options.quiz}
                description="An attempt is spent for good, and the LMS rarely gives another. A model on your own session picks the answers."
                label="Answer quizzes"
                onChange={(next) => patch({ quiz: next })}
              />
            </div>

            {options.quiz ? (
              <div className="space-y-1.5 pt-3">
                <Label htmlFor="run-quiz-model">Model that answers</Label>
                <ModelSelect
                  id="run-quiz-model"
                  models={chatModels}
                  onChange={(next) => patch({ quizModel: next })}
                  value={options.quizModel}
                />
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>

        {invalid ? (
          <p className="text-destructive text-xs" id="run-invalid">
            {invalid.message}
          </p>
        ) : null}

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
              type="button"
              variant="outline"
            >
              <Square />
              Stop
            </Button>
          ) : (
            <Button disabled={!hasSession} type="submit">
              <Play />
              {startLabel()}
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

          <Button
            disabled={!hasSession || running}
            onClick={() => submit(true)}
            type="button"
            variant="outline"
          >
            <Eye />
            Preview
          </Button>

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

        {confirming ? (
          <p className="text-xs">
            This run submits quiz attempts, which cannot be taken back. Confirm
            to go ahead, or turn quizzes off under More options.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Preview lists what a run would do and changes nothing.
          </p>
        )}
      </form>
    </section>
  );
};
