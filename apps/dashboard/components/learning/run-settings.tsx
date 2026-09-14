"use client";

import { useI18n } from "@thaipass/internationalization";

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

const PACE_ITEMS: Record<string, string> = Object.fromEntries(
  PACE_STEPS.map((step) => [String(step), `${step}×`])
);

const asGoal = (value: string | null): RunGoal =>
  value === "earn" ? "earn" : "target";

export interface Invalid {
  field: RunField;
  message: string;
}

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
  const { t } = useI18n();
  const copy = t.learning.settings;
  const goalItems: Record<RunGoal, string> = {
    earn: copy.goal.earn,
    target: copy.goal.target,
  };

  const errorFor = (field: RunField): string | undefined =>
    invalid?.field === field ? `run-${field}-error` : undefined;

  return (
    <fieldset className="space-y-4 pb-2" disabled={running}>
      <div className="space-y-1.5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="run-goal">{copy.goal.label}</Label>
            <Select
              items={goalItems}
              onValueChange={(next) => patch({ goal: asGoal(next) })}
              value={options.goal}
            >
              <SelectTrigger className="w-full" id="run-goal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="target">{copy.goal.target}</SelectItem>
                <SelectItem value="earn">{copy.goal.earn}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="run-amount">{copy.amount[options.goal]}</Label>
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

        <p className="text-muted-foreground text-xs" id="run-amount-hint">
          {copy.hint[options.goal]}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="run-pace">{copy.pace.label}</Label>
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
          <p className="text-muted-foreground text-xs">{copy.pace.hint}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="run-lessons">{copy.lessons.label}</Label>
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
            {copy.lessons.hint}
          </p>
          <FieldError field="maxLessons" invalid={invalid} />
        </div>
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <span className="text-sm leading-none font-medium">{copy.courses}</span>
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
          description={copy.options.attachments.description}
          label={copy.options.attachments.label}
          onChange={(next) => patch({ attachments: next })}
        />
        <OptionSwitch
          checked={options.articles}
          description={copy.options.articles.description}
          label={copy.options.articles.label}
          onChange={(next) => patch({ articles: next })}
        />
        <OptionSwitch
          checked={options.quiz}
          description={copy.options.quiz.description}
          label={copy.options.quiz.label}
          onChange={(next) => patch({ quiz: next })}
        />
      </div>

      {options.quiz ? (
        <div className="space-y-1.5">
          <Label htmlFor="run-quiz-model">{copy.quizModel}</Label>
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
