import { TriangleAlert } from "lucide-react";

import { StatusDot } from "@/components/layout/status-dot";
import { LessonRow } from "@/components/learning/lesson-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatPlural } from "@/lib/format";
import { activeLesson, isRunEmpty } from "@/lib/learn-run";
import type { RunFailure, RunState } from "@/lib/learn-run";
import type { LessonKind } from "@/lib/lms";

const VERBS: Record<LessonKind, string> = {
  article: "Reading",
  attachment: "Reading",
  quiz: "Answering",
  video: "Watching",
};

const SCOPE_TITLES: Record<RunFailure["scope"], string> = {
  course: "A course was left unfinished",
  lesson: "A lesson was left unfinished",
  session: "The run stopped",
};

/** One sentence for a screen reader and for anyone not watching the list. */
const statusLine = (state: RunState, running: boolean): string => {
  const lesson = activeLesson(state);
  if (lesson) {
    return `${VERBS[lesson.kind]} \u201C${lesson.title}\u201D`;
  }
  if (running) {
    return "Reading what this account has left to learn…";
  }
  if (state.summary) {
    return state.summary.reached
      ? "The run reached its goal."
      : "The run stopped short of its goal.";
  }
  if (state.stopped) {
    return "You stopped the run. Starting it again picks up from the last stamp.";
  }
  return "";
};

const RunSummary = ({ state }: { readonly state: RunState }) => {
  const { summary } = state;
  if (!summary) {
    return null;
  }

  return (
    <div className="ring-foreground/10 space-y-1 rounded-xl px-3 py-2.5 ring-1">
      <p className="text-sm font-medium tabular-nums">
        {`+${summary.earned.toLocaleString()} EXP in ${formatPlural(summary.lessons, "lesson")}`}
      </p>
      <p className="text-muted-foreground text-xs">
        {`Period total ${summary.monthly?.toLocaleString() ?? "unknown"} of ${summary.target.toLocaleString()} · ${summary.reason}`}
      </p>
      {summary.paused ? (
        <p className="text-xs">
          The run used up its time budget mid-lesson. Start it again to pick up
          from the last stamp.
        </p>
      ) : null}
    </div>
  );
};

export const RunFeed = ({
  error,
  running,
  state,
}: {
  readonly error: string | null;
  readonly running: boolean;
  readonly state: RunState;
}) => {
  const line = statusLine(state, running);

  return (
    <section aria-labelledby="activity-heading" className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium" id="activity-heading">
            Activity
          </h2>
          {running ? <StatusDot label="Run in progress" tone="online" /> : null}
        </div>
        <output
          aria-live="polite"
          className="text-muted-foreground block text-sm"
        >
          {line === ""
            ? "No run yet. Start one and its lessons appear here."
            : line}
        </output>
      </div>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>The run could not be followed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isRunEmpty(state) ? null : (
        <ol className="space-y-3">
          {state.courses.map((course) => (
            <li
              className="ring-foreground/10 overflow-hidden rounded-xl ring-1"
              key={course.code}
            >
              <div className="bg-muted/40 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-xs">{course.code}</span>
                  <span className="text-sm font-medium">
                    {course.title ?? "Untitled course"}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {formatPlural(course.planned, "lesson")}
                  {course.bonus
                    ? ` · +${course.bonus.toLocaleString()} EXP on completion`
                    : ""}
                  {course.closed ? " · closed" : ""}
                </span>
              </div>

              {course.lessons.length === 0 ? (
                <p className="text-muted-foreground px-3 py-2.5 text-xs">
                  Nothing open in this course.
                </p>
              ) : (
                <ul className="divide-y">
                  {course.lessons.map((lesson) => (
                    <LessonRow
                      active={lesson.id === state.active}
                      key={lesson.id}
                      lesson={lesson}
                    />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <RunSummary state={state} />

      {state.failures.length === 0 ? null : (
        <ul className="space-y-2">
          {state.failures.map((failure) => (
            <li key={failure.key}>
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>{SCOPE_TITLES[failure.scope]}</AlertTitle>
                <AlertDescription>
                  {failure.message}
                  {failure.detail ? (
                    <span className="block">{failure.detail}</span>
                  ) : null}
                </AlertDescription>
              </Alert>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
