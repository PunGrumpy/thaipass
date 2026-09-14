"use client";

import { useI18n } from "@thaipass/internationalization";
import type { Dictionary } from "@thaipass/internationalization";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { StatusDot } from "@/components/layout/status-dot";
import { LessonRow } from "@/components/learning/lesson-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { fill, pluralize } from "@/lib/format";
import { activeLesson, isRunEmpty } from "@/lib/learn-run";
import type { RunState } from "@/lib/learn-run";

type FeedCopy = Dictionary["learning"]["feed"];

const statusLine = (
  state: RunState,
  running: boolean,
  copy: FeedCopy
): string => {
  const lesson = activeLesson(state);
  if (lesson) {
    return fill(copy.active[lesson.kind], lesson.title);
  }
  if (running) {
    return state.preview ? copy.previewRunning : copy.reading;
  }
  if (state.summary) {
    if (state.preview) {
      return copy.previewDone;
    }
    return state.summary.reached ? copy.reached : copy.short;
  }
  if (state.stopped) {
    return copy.stopped;
  }
  return "";
};

const RunSummary = ({
  copy,
  state,
}: {
  readonly copy: FeedCopy;
  readonly state: RunState;
}) => {
  const { preview, summary } = state;
  if (!summary) {
    return null;
  }

  const lessons = pluralize(summary.lessons, copy.lessons);
  const earned = summary.earned.toLocaleString();

  return (
    <div className="ring-foreground/10 space-y-1 rounded-xl px-3 py-2.5 ring-1">
      <p className="text-sm font-medium tabular-nums">
        {fill(preview ? copy.previewSummary : copy.summary, earned, lessons)}
      </p>
      <p className="text-muted-foreground text-xs">
        {fill(
          copy.total,
          summary.monthly?.toLocaleString() ?? copy.unknown,
          summary.target.toLocaleString(),
          summary.reason
        )}
      </p>
      {preview ? <p className="text-xs">{copy.previewUnchanged}</p> : null}
      {summary.paused ? <p className="text-xs">{copy.paused}</p> : null}
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
  const { t } = useI18n();
  const copy = t.learning.feed;
  const line = statusLine(state, running, copy);
  const idle =
    line === "" && !error && state.courses.length === 0 && !state.summary;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <output
          aria-live="polite"
          className="text-muted-foreground min-w-0 flex-1 text-sm"
        >
          {line}
        </output>
        {state.preview ? (
          <Badge variant="secondary">{copy.preview}</Badge>
        ) : null}
        {running ? (
          <StatusDot
            label={state.preview ? copy.previewRunningLabel : copy.runningLabel}
            tone="online"
          />
        ) : null}
      </div>

      <div className="space-y-4 p-4 empty:hidden">
        {idle ? <EmptyState className="py-4">{copy.idle}</EmptyState> : null}
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{copy.failed}</AlertTitle>
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
                      {course.title ?? copy.untitled}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {pluralize(course.planned, copy.lessons)}
                    {course.bonus
                      ? ` · ${fill(copy.courseBonus, course.bonus.toLocaleString())}`
                      : ""}
                    {course.closed ? ` · ${copy.courseClosed}` : ""}
                  </span>
                </div>

                {course.lessons.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-2.5 text-xs">
                    {copy.courseEmpty}
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

        <RunSummary copy={copy} state={state} />

        {state.failures.length === 0 ? null : (
          <ul className="space-y-2">
            {state.failures.map((failure) => (
              <li key={failure.key}>
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>{copy.scope[failure.scope]}</AlertTitle>
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
      </div>
    </div>
  );
};
