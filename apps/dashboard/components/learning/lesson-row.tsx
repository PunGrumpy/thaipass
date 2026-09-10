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
import { formatClock } from "@/lib/format";
import type { RunLesson } from "@/lib/learn-run";
import type { LessonKind, LessonStatus } from "@/lib/lms";

const KIND_ICONS: Record<LessonKind, LucideIcon> = {
  article: BookOpen,
  attachment: Paperclip,
  quiz: ListChecks,
  video: Video,
};

const KIND_LABELS: Record<LessonKind, string> = {
  article: "Article",
  attachment: "Attachment",
  quiz: "Quiz",
  video: "Video",
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

const STATUS_LABELS: Record<LessonStatus, string> = {
  completed: "Done",
  paused: "Paused",
  planned: "Planned",
  skipped: "Skipped",
  started: "Learning",
};

const PERCENT = 100;

const quizLine = (lesson: RunLesson): string | null => {
  const { quiz } = lesson;
  if (!quiz) {
    return null;
  }
  const score =
    quiz.score === null || quiz.total === null
      ? "no score"
      : `${quiz.score} of ${quiz.total}`;
  const verdict =
    quiz.passed === null ? "" : `, ${quiz.passed ? "passed" : "failed"}`;
  return `answered ${quiz.answered} of ${quiz.questions}, ${score}${verdict}`;
};

const detailOf = (lesson: RunLesson): string | null => {
  if (lesson.reason) {
    return lesson.reason;
  }
  if (lesson.status === "completed" && lesson.exp !== null) {
    return `+${lesson.exp.toLocaleString()} EXP`;
  }
  if (lesson.status === "planned" && lesson.exp !== null) {
    return `about ${lesson.exp.toLocaleString()} EXP`;
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
  const KindIcon = KIND_ICONS[lesson.kind];
  const StatusIcon = STATUS_ICONS[lesson.status];
  const detail = detailOf(lesson);
  const quiz = quizLine(lesson);
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
          <span>{KIND_LABELS[lesson.kind]}</span>
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
              {formatClock(lesson.watched ?? 0)} of{" "}
              {formatClock(lesson.duration)}
            </ProgressLabel>
            <ProgressValue className="text-xs" />
          </Progress>
        ) : null}
      </div>

      <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
        <StatusIcon aria-hidden="true" className="size-3" />
        {STATUS_LABELS[lesson.status]}
      </span>
    </li>
  );
};
