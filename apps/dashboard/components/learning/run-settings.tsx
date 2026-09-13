"use client";

import { CoursePicker } from "@/components/learning/course-picker";
import { OptionSwitch } from "@/components/learning/option-switch";
import { ModelSelect } from "@/components/playground/model-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_LESSONS, PACE_STEPS } from "@/lib/learn-run";
import type { RunField, RunGoal, RunOptions } from "@/lib/learn-run";
import type { CatalogModel } from "@/lib/proxy";
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

/** A select can report no value at all; the goal has two states, and one default. */
const asGoal = (value: string | null): RunGoal =>
  value === "earn" ? "earn" : "target";

export interface Invalid {
  field: RunField;
  message: string;
}

/**
 * The message belongs under the control that failed, not in one place at the
 * bottom of a form whose fields are folded away.
 */
const FieldError = ({
  field,
  invalid,
}: {
  readonly field: RunField;
  readonly invalid: Invalid | null;
}) =>
  invalid?.field === field ? (
    <p className="text-destructive text-xs" id={`run-${field}-error`}>
      {invalid.message}
    </p>
  ) : null;

export interface RunSettingsProps {
  chatModels: readonly CatalogModel[];
  hasSession: boolean;
  invalid: Invalid | null;
  options: RunOptions;
  patch: (next: Partial<RunOptions>) => void;
  /** A run carries the body it was started with, so its fields stop taking edits. */
  running: boolean;
}

export const RunSettings = ({
  chatModels,
  hasSession,
  invalid,
  options,
  patch,
  running,
}: RunSettingsProps) => {
  const errorFor = (field: RunField): string | undefined =>
    invalid?.field === field ? `run-${field}-error` : undefined;

  return (
    <fieldset className="space-y-4 pb-2" disabled={running}>
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
            <FieldError field="amount" invalid={invalid} />
          </div>
        </div>

        {/* The goal and its figure are one decision, so they share one
              line of explanation instead of leaving a gap beside the
              select. */}
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
          <FieldError field="maxLessons" invalid={invalid} />
        </div>
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <span className="text-sm leading-none font-medium">Courses</span>
        <CoursePicker
          disabled={!hasSession}
          onChange={(courses) => patch({ courses })}
          value={options.courses}
        />
        <FieldError field="courses" invalid={invalid} />
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
        <div className="space-y-1.5">
          <Label htmlFor="run-quiz-model">Model that answers</Label>
          <ModelSelect
            id="run-quiz-model"
            models={chatModels}
            onChange={(next) => patch({ quizModel: next })}
            value={options.quizModel}
          />
        </div>
      ) : null}
    </fieldset>
  );
};
