"use client";

import { useI18n } from "@thaipass/internationalization";
import type { Dictionary } from "@thaipass/internationalization";
import {
  BookOpen,
  Check,
  Circle,
  ListChecks,
  Minus,
  Paperclip,
  Play,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { fill, formatClock } from "@/lib/format";
import type { RunLesson } from "@/lib/learn-run";
import type { LessonKind, LessonStatus } from "@/lib/lms";

const KIND_ICONS: Record<LessonKind, LucideIcon> = {
  article: BookOpen,
  attachment: Paperclip,
  quiz: ListChecks,
  video: Video,
};

/*
 * Status is carried by a word and an icon rather than a colour, so a row reads
 * the same to a reader who cannot tell the two greys apart.
 */
const STATUS_ICONS: Record<LessonStatus, LucideIcon> = {
  completed: Check,
  paused: Minus,
  planned: Circle,
  skipped: Minus,
  started: Play,
};

const PERCENT = 100;

type LessonCopy = Dictionary["learning"]["lesson"];

/* Independent facts joined by a separator rather than a sentence built from
   fragments, so each one translates on its own. */
const quizLine = (lesson: RunLesson, copy: LessonCopy): string | null => {
  const { quiz } = lesson;
  if (!quiz) {
    return null;
  }
  const parts = [fill(copy.quiz.answered, quiz.answered, quiz.questions)];
  if (quiz.score !== null && quiz.total !== null) {
    parts.push(fill(copy.quiz.score, quiz.score, quiz.total));
  }
  if (quiz.passed !== null) {
    parts.push(quiz.passed ? copy.quiz.passed : copy.quiz.failed);
  }
  return parts.join(" · ");
};

const detailOf = (lesson: RunLesson, copy: LessonCopy): string | null => {
  if (lesson.reason) {
    return lesson.reason;
  }
  if (lesson.exp === null) {
    return null;
  }
  if (lesson.status === "completed") {
    return fill(copy.earnedExp, lesson.exp.toLocaleString());
  }
  if (lesson.status === "planned") {
    return fill(copy.aboutExp, lesson.exp.toLocaleString());
  }
  return null;
};

export const LessonRow = ({
  active,
  lesson,
}: {
  readonly active: boolean;
  readonly lesson: RunLesson;
}) => {
  const { t } = useI18n();
  const copy = t.learning.lesson;
  const KindIcon = KIND_ICONS[lesson.kind];
  const StatusIcon = STATUS_ICONS[lesson.status];
  const detail = detailOf(lesson, copy);
  const quiz = quizLine(lesson, copy);
  const watching = active && lesson.duration !== null && lesson.duration > 0;

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <KindIcon
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm leading-snug break-words">{lesson.title}</p>

        <p className="text-muted-foreground text-xs">
          <span>{copy.kind[lesson.kind]}</span>
          {lesson.duration === null || watching ? null : (
            <span className="tabular-nums">
              {" · "}
              {formatClock(lesson.duration)}
            </span>
          )}
          {detail === null ? null : <span>{` · ${detail}`}</span>}
        </p>

        {quiz === null ? null : (
          <p className="text-muted-foreground text-xs">{quiz}</p>
        )}

        {watching && lesson.duration !== null ? (
          <Progress
            className="pt-1"
            value={Math.min(
              PERCENT,
              Math.round(((lesson.watched ?? 0) / lesson.duration) * PERCENT)
            )}
          >
            <ProgressLabel className="text-muted-foreground text-xs font-normal tabular-nums">
              {`${formatClock(lesson.watched ?? 0)} / ${formatClock(lesson.duration)}`}
            </ProgressLabel>
            <ProgressValue className="text-xs" />
          </Progress>
        ) : null}
      </div>

      <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
        <StatusIcon aria-hidden="true" className="size-3" />
        {copy.status[lesson.status]}
      </span>
    </li>
  );
};
