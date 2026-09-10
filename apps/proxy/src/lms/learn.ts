import { DEFAULT_QUIZ_MODEL, modelAnswerer } from "./answer";
import type { Answerer, QuizPick } from "./answer";
import {
  completeCourse,
  completeLesson,
  enrollCourse,
  listCourses,
  listLessons,
  openLesson,
  readSessionExp,
  readSessionTier,
  stampQuizAnswer,
  stampVideo,
  submitQuiz,
} from "./api";
import type {
  Course,
  Lesson,
  LessonContent,
  QuizContent,
  SessionExp,
  SessionTier,
  VideoStamp,
} from "./api";
import { findNumber } from "./payload";
import { LmsError } from "./request";

/**
 * Replays what the lesson page does, lesson type by lesson type: a video is
 * opened and stamped second by second, an attachment or an article is opened
 * and marked read, a quiz is answered and submitted. The course is asked to
 * close after each one, the LMS awards EXP per completed lesson, and the run
 * stops once it has earned the target.
 */

export const DEFAULT_TARGET = 100;
/** The player never lets a stamp advance more than this over the last one the LMS confirmed. */
export const STAMP_INTERVAL_S = 10;
const DEFAULT_MAX_LESSONS = 50;
const DEFAULT_PACE = 1;
const PAGE_SIZE = 20;
const MAX_PAGES = 50;
const PERCENT_DONE = 100;
const MS_PER_S = 1000;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const COMPLETED = "COMPLETED";

/** What the proxy can learn: how a lesson is finished, not what it is called. */
export type LessonKind = "article" | "attachment" | "quiz" | "video";

/** The lesson types the listing sends; the two tests are both quizzes. */
const KIND_BY_TYPE = new Map<string, LessonKind>([
  ["ARTICLE", "article"],
  ["ATTACHMENT", "attachment"],
  ["POST_TEST", "quiz"],
  ["PRE_TEST", "quiz"],
  ["QUIZ", "quiz"],
  ["VIDEO", "video"],
]);

/**
 * What the tier calls each lesson type where it prices them. A pre-test and a
 * post-test are one kind to learn and two lines on the price list.
 */
const EXP_KEY_BY_TYPE = new Map<string, string>([
  ["ARTICLE", "article"],
  ["ATTACHMENT", "attachment"],
  ["POST_TEST", "quiz_post_test"],
  ["PRE_TEST", "quiz_pre_test"],
  ["QUIZ", "quiz"],
  ["VIDEO", "video"],
]);

/** `member.expEarn` is what a live session-exp carries; the rest are the names the bundle hints at. */
const MONTHLY_KEYS = [
  "expEarn",
  "monthlyExp",
  "currentMonthExp",
  "monthExp",
  "expThisMonth",
  "thisMonthExp",
  "monthlyPoints",
] as const;

const DONE_STATUSES = new Set([COMPLETED, "COMPLETE", "DONE", "PASSED"]);

const STARTED_STATUSES = new Set([
  "IN_PROGRESS",
  "INPROGRESS",
  "LEARNING",
  "STARTED",
]);

/** A course or a lesson the account has already finished; the LMS marks both the same ways. */
export const isDone = (record: Course | Lesson): boolean => {
  if (record.isCompleted === true || record.completed === true) {
    return true;
  }
  const status =
    record.learnerStatus ??
    record.learnerLessonStatus ??
    record.lessonProgressStatus ??
    record.status;
  if (status && DONE_STATUSES.has(status.toUpperCase())) {
    return true;
  }
  return record.progress !== undefined && record.progress !== null
    ? record.progress >= PERCENT_DONE
    : false;
};

/**
 * A course the account has opened and not finished. These go first: a course
 * pays for the course as well as for its lessons, so the half-done ones are
 * the cheapest EXP left on the account, and finishing them leaves less behind.
 */
export const isStarted = (course: Course): boolean => {
  const status = course.learnerStatus ?? course.status;
  if (status && STARTED_STATUSES.has(status.toUpperCase())) {
    return true;
  }
  return course.progress !== undefined && course.progress !== null
    ? course.progress > 0
    : false;
};

/** The routes take the course code; a bare id carries a `course-` prefix the web client strips. */
export const courseCode = (course: Course): string | undefined =>
  course.code || course.id?.replace(/^course-/u, "") || undefined;

export const kindOf = (lesson: Lesson): LessonKind | undefined =>
  KIND_BY_TYPE.get(lesson.lessonType?.toUpperCase() ?? "");

const positive = (value: number | undefined): number | undefined =>
  value !== undefined && value > 0 ? value : undefined;

/** The video's own length first; the listing rounds it. */
export const durationOf = (
  content: LessonContent,
  lesson: Lesson
): number | undefined =>
  positive(content.videoContent?.durationSeconds) ??
  positive(content.durationSeconds) ??
  positive(lesson.durationSeconds) ??
  positive(lesson.durationInSeconds);

/** What the player sends as the video plays, field for field. */
export const stampBody = (
  content: LessonContent,
  enrollmentId: string,
  watchedSeconds: number,
  durationSeconds: number,
  lessonProgressId?: string
): VideoStamp => ({
  durationSeconds: Math.floor(durationSeconds),
  enrollmentId,
  lessonProgressId: lessonProgressId ?? content.lessonProgressId ?? null,
  videoContentId: content.videoContent?.videoContentId ?? "",
  watchedSeconds: Math.floor(watchedSeconds),
});

/** Every `interval` seconds of playback past what is already watched, and the end of the video last. */
export const planStamps = (
  duration: number,
  interval = STAMP_INTERVAL_S,
  from = 0
): number[] => {
  const stamps: number[] = [];
  for (let at = from + interval; at < duration; at += interval) {
    stamps.push(at);
  }
  if (from < duration) {
    stamps.push(duration);
  }
  return stamps;
};

/** The period's figure, from the key a live session-exp carries. */
export const monthlyExpOf = (payload: SessionExp): number | undefined =>
  findNumber(payload, MONTHLY_KEYS, true);

/** Waits, and returns early when the caller goes away. */
export const pause = async (
  ms: number,
  signal?: AbortSignal
): Promise<void> => {
  if (ms <= 0 || signal?.aborted) {
    return;
  }
  const waited = Promise.withResolvers<true>();
  const timer = setTimeout(() => waited.resolve(true), ms);
  const onAbort = (): void => {
    clearTimeout(timer);
    waited.resolve(true);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  await waited.promise;
  signal?.removeEventListener("abort", onAbort);
};

export type LessonStatus =
  | "planned"
  | "started"
  | "skipped"
  | "paused"
  | "completed";

export type ErrorScope = "course" | "lesson" | "session";

export type LearnEvent =
  | {
      readonly event: "exp";
      readonly phase: "before" | "after";
      readonly monthly: number | null;
    }
  | {
      readonly event: "course";
      readonly code: string;
      readonly title: string | null;
      readonly lessons: number;
      /** What the course itself pays on top of its lessons, where it names a figure. */
      readonly exp: number | null;
      /** Paid once the course closes; some courses carry one, most do not. */
      readonly bonus: number | null;
    }
  | {
      readonly event: "lesson";
      readonly code: string;
      readonly lesson: string;
      readonly title: string | null;
      readonly kind: LessonKind;
      readonly status: LessonStatus;
      readonly duration?: number;
      readonly watched?: number;
      readonly stamp?: VideoStamp;
      readonly reason?: string;
      readonly exp?: number;
      readonly earned?: number;
      readonly monthly?: number | null;
    }
  | {
      readonly event: "stamp";
      readonly code: string;
      readonly lesson: string;
      readonly at: number;
      readonly duration: number;
      readonly status: string | null;
    }
  | {
      readonly event: "quiz";
      readonly code: string;
      readonly lesson: string;
      readonly questions: number;
      readonly answered: number;
      readonly score: number | null;
      readonly total: number | null;
      readonly passed: boolean | null;
    }
  | { readonly event: "course_completed"; readonly code: string }
  | {
      readonly event: "error";
      readonly scope: ErrorScope;
      readonly status: number;
      readonly code: string | null;
      readonly message: string;
      readonly detail: string | null;
      readonly fatal: boolean;
    }
  | {
      readonly event: "done";
      readonly earned: number;
      readonly lessons: number;
      readonly monthly: number | null;
      readonly target: number;
      readonly reached: boolean;
      /** True when the time budget ran out mid-lesson; the next call resumes from the last stamp. */
      readonly paused: boolean;
      readonly reason: string;
    };

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface LearnOptions {
  readonly cookie: string;
  /** The period's EXP to reach before stopping; this run's own earnings when the LMS reports no figure. */
  readonly target?: number;
  /** EXP to earn in this run whatever the period has; overrides target. */
  readonly earn?: number;
  /** Playback speed: 1 stamps in real time, 4 gets through a video in a quarter of its length. */
  readonly pace?: number;
  readonly maxLessons?: number;
  /** Marks attachment lessons read, which is what earns their EXP. On by default. */
  readonly attachments?: boolean;
  /** Marks article lessons read the same way. On by default. */
  readonly articles?: boolean;
  /** Course codes to learn; the whole catalogue when this names none. */
  readonly courses?: readonly string[];
  /** Answers and submits quizzes. Off by default: an attempt is spent for good. */
  readonly quiz?: boolean;
  /** The AI Pass model that answers quiz questions. */
  readonly quizModel?: string;
  /** Stands in for that model, so a test can answer without a chat turn. */
  readonly answer?: Answerer;
  /** Lists what would be learned and sends nothing that changes the account. */
  readonly dryRun?: boolean;
  readonly signal?: AbortSignal;
  /** Wall-clock the run may spend; it ends cleanly before a stamp would overrun it. */
  readonly budgetMs?: number;
  readonly stampIntervalS?: number;
  readonly sleep?: Sleep;
  readonly now?: () => number;
}

interface Run {
  readonly cookie: string;
  readonly target: number;
  readonly earn: number | undefined;
  readonly pace: number;
  readonly maxLessons: number;
  readonly dryRun: boolean;
  readonly interval: number;
  readonly signal: AbortSignal | undefined;
  readonly sleep: Sleep;
  readonly now: () => number;
  readonly deadline: number | undefined;
  /** The lesson kinds this run is allowed to learn. */
  readonly kinds: ReadonlySet<LessonKind>;
  /** The course codes this run is held to; empty means the whole catalogue. */
  readonly courses: ReadonlySet<string>;
  readonly answer: Answerer;
  /** Set when a lesson stopped for the budget rather than for the LMS. */
  paused: boolean;
  /** The tier's price list, keyed by the lesson type names it uses. */
  lessonExp: ReadonlyMap<string, number>;
  /** The period's EXP as last read, so a lesson's worth is what the LMS actually added. */
  monthly: number | undefined;
  earned: number;
  lessons: number;
}

/** An `earn` goal is this run's own; a target is the period's figure when the LMS reports one. */
const targetReached = (run: Run): boolean =>
  run.earn === undefined
    ? (run.monthly ?? run.earned) >= run.target
    : run.earned >= run.earn;

const TIME_BUDGET_SPENT = "time budget spent";

const limitReached = (run: Run): string | undefined => {
  if (run.signal?.aborted) {
    return "the caller went away";
  }
  if (run.paused) {
    return TIME_BUDGET_SPENT;
  }
  if (targetReached(run)) {
    return run.earn === undefined ? "target reached" : "earned what was asked";
  }
  if (run.lessons >= run.maxLessons) {
    return "lesson cap reached";
  }
  return undefined;
};

const failure = (
  cause: unknown,
  scope: ErrorScope,
  fatal: boolean
): LearnEvent =>
  cause instanceof LmsError
    ? {
        code: cause.code ?? null,
        detail: cause.detail ?? null,
        event: "error",
        fatal,
        message: cause.message,
        scope,
        status: cause.status,
      }
    : {
        code: null,
        detail: null,
        event: "error",
        fatal,
        message: cause instanceof Error ? cause.message : String(cause),
        scope,
        status: 0,
      };

const isSkippable = (cause: unknown): boolean =>
  cause instanceof LmsError &&
  (cause.status === FORBIDDEN || cause.status === NOT_FOUND);

const isAuthFailure = (cause: unknown): boolean =>
  cause instanceof LmsError && cause.isAuth;

export const titleOf = (record: Course | Lesson): string | null =>
  record.title ?? null;

/** Best effort: the figure prices a lesson and is reported, the run does not depend on it. */
const readMonthly = async (run: Run): Promise<number | undefined> => {
  try {
    return monthlyExpOf(await readSessionExp(run.cookie, run.signal));
  } catch {
    return undefined;
  }
};

/** What the tier says this lesson pays, by its own type, or by its kind. */
const expFor = (run: Run, lesson: Lesson, kind: LessonKind): number => {
  const type = lesson.lessonType?.toUpperCase() ?? "";
  const key = EXP_KEY_BY_TYPE.get(type);
  return (
    (key === undefined ? undefined : run.lessonExp.get(key)) ??
    run.lessonExp.get(kind) ??
    0
  );
};

/** What the LMS added for the lesson, or the tier's figure when it cannot be read. */
const settleLesson = async (
  run: Run,
  lesson: Lesson,
  kind: LessonKind
): Promise<number> => {
  const before = run.monthly;
  const after = await readMonthly(run);
  if (after !== undefined) {
    run.monthly = after;
  }
  if (before !== undefined && after !== undefined) {
    return Math.max(0, after - before);
  }
  return expFor(run, lesson, kind);
};

/** One lesson being learned: what the listing said, and what opening it answered. */
interface Attempt {
  readonly code: string;
  readonly content: LessonContent;
  readonly enrollmentId: string;
  readonly id: string;
  readonly kind: LessonKind;
  readonly lesson: Lesson;
  readonly title: string | null;
}

const skipped = (at: Attempt, reason: string): LearnEvent => ({
  code: at.code,
  event: "lesson",
  kind: at.kind,
  lesson: at.id,
  reason,
  status: "skipped",
  title: at.title,
});

const started = (at: Attempt): LearnEvent => ({
  code: at.code,
  event: "lesson",
  kind: at.kind,
  lesson: at.id,
  status: "started",
  title: at.title,
});

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

interface Playback {
  readonly duration: number;
  readonly watched: number;
}

// Stamps the seconds watched as the video would play; returns the status the LMS last reported.
const stampLesson = async function* stampLesson(
  run: Run,
  code: string,
  id: string,
  content: LessonContent,
  enrollmentId: string,
  playback: Playback
): AsyncGenerator<LearnEvent, string | undefined> {
  const { duration, watched } = playback;
  let previous = watched;
  let progressId = content.lessonProgressId;
  let status: string | undefined;
  // oxlint-disable no-await-in-loop
  for (const at of planStamps(duration, run.interval, watched)) {
    const wait = ((at - previous) / run.pace) * MS_PER_S;
    if (run.deadline !== undefined && run.now() + wait >= run.deadline) {
      run.paused = true;
      return status;
    }
    await run.sleep(wait, run.signal);
    if (run.signal?.aborted) {
      return status;
    }
    const result = await stampVideo(
      run.cookie,
      code,
      id,
      stampBody(content, enrollmentId, at, duration, progressId),
      run.signal
    );
    progressId = result.lessonProgressId ?? progressId;
    status = result.status ?? status;
    yield {
      at,
      code,
      duration,
      event: "stamp",
      lesson: id,
      status: status ?? null,
    };
    previous = at;
  }
  // oxlint-enable no-await-in-loop
  return status;
};

// Plays the video out; true when the LMS marked the lesson complete.
const watchVideo = async function* watchVideo(
  run: Run,
  at: Attempt
): AsyncGenerator<LearnEvent, boolean> {
  const { code, content, enrollmentId, id, kind, title } = at;
  const duration = durationOf(content, at.lesson);
  if (!duration) {
    yield skipped(at, "no video duration in the lesson content");
    return false;
  }
  if (!content.videoContent?.videoContentId) {
    yield skipped(at, "no video content id in the lesson content");
    return false;
  }
  const watched = Math.min(
    duration,
    positive(content.videoContent.watchedSeconds) ?? 0
  );
  yield {
    code,
    duration,
    event: "lesson",
    kind,
    lesson: id,
    stamp: stampBody(content, enrollmentId, watched, duration),
    status: "started",
    title,
    watched,
  };
  const status = yield* stampLesson(run, code, id, content, enrollmentId, {
    duration,
    watched,
  });
  if (run.signal?.aborted) {
    return false;
  }
  if (run.paused) {
    yield {
      code,
      event: "lesson",
      kind,
      lesson: id,
      reason: `${TIME_BUDGET_SPENT}; the next call resumes from the last stamp`,
      status: "paused",
      title,
    };
    return false;
  }
  if (status?.toUpperCase() !== COMPLETED) {
    yield skipped(
      at,
      `the LMS left the lesson ${status ?? "without a status"} after the last stamp`
    );
    return false;
  }
  return true;
};

/** Whether the lesson carries the file or the page it says it does. */
const hasReading = (at: Attempt): boolean =>
  at.kind === "article"
    ? at.content.articleContent?.articleContentId !== undefined
    : at.content.lessonContentAttachment?.attachmentContentId !== undefined;

// What the reader does at the bottom of the file or the page: mark as read.
const readLesson = async function* readLesson(
  run: Run,
  at: Attempt
): AsyncGenerator<LearnEvent, boolean> {
  if (!hasReading(at)) {
    yield skipped(at, `no ${at.kind} in the lesson content`);
    return false;
  }
  yield started(at);
  const result = await completeLesson(
    run.cookie,
    at.code,
    at.id,
    {
      enrollmentId: at.enrollmentId,
      lessonProgressId: at.content.lessonProgressId ?? null,
    },
    run.signal
  );
  if (result.status?.toUpperCase() !== COMPLETED) {
    yield skipped(
      at,
      `the LMS left the lesson ${result.status ?? "without a status"} after it was marked read`
    );
    return false;
  }
  return true;
};

/** Why this quiz cannot be taken, or nothing when it can. */
const quizBlocked = (quiz: QuizContent): string | undefined => {
  if (quiz.submittedAt) {
    return "the attempt is already submitted";
  }
  const spent = quiz.attemptCount ?? 0;
  if (quiz.maxAttempt !== undefined && spent >= quiz.maxAttempt) {
    return `no attempts left, ${spent} of ${quiz.maxAttempt} spent`;
  }
  return quiz.questions.some((question) => question.questionId)
    ? undefined
    : "the quiz has no questions";
};

/** Sends one answer per question, as the page does on every click. */
const stampAnswers = async (
  run: Run,
  at: Attempt,
  picks: readonly QuizPick[],
  opening: string | undefined
): Promise<string | undefined> => {
  let attemptId = opening;
  // oxlint-disable no-await-in-loop
  for (const pick of picks) {
    const result = await stampQuizAnswer(
      run.cookie,
      at.code,
      at.id,
      {
        attemptId: attemptId ?? null,
        choices: pick.choiceIds.map((choiceId) => ({
          choiceId,
          isSelected: true,
        })),
        questionId: pick.questionId,
      },
      run.signal
    );
    attemptId = result.attemptId ?? attemptId;
  }
  // oxlint-enable no-await-in-loop
  return attemptId;
};

// Answers every question and submits the attempt. A quiz answered only in part
// is left alone: an attempt spent is rarely one the LMS gives back.
const takeQuiz = async function* takeQuiz(
  run: Run,
  at: Attempt
): AsyncGenerator<LearnEvent, boolean> {
  const quiz = at.content.quizContent;
  if (!quiz) {
    yield skipped(at, "no quiz in the lesson content");
    return false;
  }
  const blocked = quizBlocked(quiz);
  if (blocked) {
    yield skipped(at, blocked);
    return false;
  }
  yield started(at);
  const { questions } = quiz;
  let picks: readonly QuizPick[];
  try {
    picks = await run.answer(questions, run.signal);
  } catch (error) {
    yield skipped(at, `the quiz went unanswered: ${messageOf(error)}`);
    return false;
  }
  if (picks.length < questions.length) {
    yield skipped(
      at,
      `only ${picks.length} of ${questions.length} questions came back answered, so nothing was submitted`
    );
    return false;
  }
  const attemptId = await stampAnswers(run, at, picks, quiz.attemptId);
  if (!attemptId) {
    yield skipped(at, "the LMS named no attempt to submit");
    return false;
  }
  const result = await submitQuiz(
    run.cookie,
    at.code,
    at.id,
    { attemptId },
    run.signal
  );
  yield {
    answered: picks.length,
    code: at.code,
    event: "quiz",
    lesson: at.id,
    passed: result.passed ?? null,
    questions: questions.length,
    score: result.score ?? null,
    total: result.totalScore ?? null,
  };
  return true;
};

const attemptLesson = (
  run: Run,
  at: Attempt
): AsyncGenerator<LearnEvent, boolean> => {
  if (at.kind === "quiz") {
    return takeQuiz(run, at);
  }
  return at.kind === "video" ? watchVideo(run, at) : readLesson(run, at);
};

// The page asks the course to close after every completed lesson; the LMS decides whether it can.
const closeCourse = async function* closeCourse(
  run: Run,
  at: Attempt
): AsyncGenerator<LearnEvent> {
  try {
    await completeCourse(
      run.cookie,
      at.code,
      at.id,
      { enrollmentId: at.enrollmentId },
      run.signal
    );
    yield { code: at.code, event: "course_completed" };
  } catch (error) {
    yield failure(error, "course", false);
  }
};

// Learns one lesson of any kind; true when the lesson was completed.
const learnLesson = async function* learnLesson(
  run: Run,
  code: string,
  enrollmentId: string,
  lesson: Lesson,
  kind: LessonKind
): AsyncGenerator<LearnEvent, boolean> {
  const id = lesson.lessonVersionId ?? "";
  const title = titleOf(lesson);
  if (run.dryRun) {
    const exp = expFor(run, lesson, kind);
    run.lessons += 1;
    run.earned += exp;
    yield {
      code,
      duration: positive(lesson.durationSeconds ?? lesson.durationInSeconds),
      earned: run.earned,
      event: "lesson",
      exp,
      kind,
      lesson: id,
      status: "planned",
      title,
    };
    return true;
  }
  const content = await openLesson(
    run.cookie,
    code,
    id,
    enrollmentId,
    run.signal
  );
  const at: Attempt = { code, content, enrollmentId, id, kind, lesson, title };
  if (content.lessonProgressStatus?.toUpperCase() === COMPLETED) {
    yield skipped(at, "the LMS already marks this lesson complete");
    return false;
  }
  const completed = yield* attemptLesson(run, at);
  if (!completed) {
    return false;
  }
  yield* closeCourse(run, at);
  const exp = await settleLesson(run, lesson, kind);
  run.earned += exp;
  run.lessons += 1;
  yield {
    code,
    earned: run.earned,
    event: "lesson",
    exp,
    kind,
    lesson: id,
    monthly: run.monthly ?? null,
    status: "completed",
    title,
  };
  return true;
};

const enrollmentFrom = (
  lessons: readonly Lesson[],
  fallback: string | undefined
): string | undefined =>
  lessons.map((lesson) => lesson.enrollmentId).find(Boolean) ?? fallback;

/** One lesson of a kind this run learns, still open, in the order the course lists them. */
interface Pending {
  readonly kind: LessonKind;
  readonly lesson: Lesson;
}

const pendingOf = (run: Run, lessons: readonly Lesson[]): Pending[] => {
  const pending: Pending[] = [];
  for (const lesson of lessons) {
    const kind = kindOf(lesson);
    if (kind && run.kinds.has(kind) && !isDone(lesson)) {
      pending.push({ kind, lesson });
    }
  }
  return pending;
};

/** Enrols, then reads the id back off the listing when the enrolment did not name it. */
const enrol = async (run: Run, code: string): Promise<string | undefined> => {
  const direct = await enrollCourse(run.cookie, code, run.signal);
  if (direct) {
    return direct;
  }
  const again = await listLessons(run.cookie, code, run.signal);
  return enrollmentFrom(again.lessons, again.enrollmentId);
};

// Learns every open video lesson of one course.
const learnCourse = async function* learnCourse(
  run: Run,
  course: Course
): AsyncGenerator<LearnEvent> {
  const code = courseCode(course);
  if (!code) {
    return;
  }
  let listing;
  try {
    listing = await listLessons(run.cookie, code, run.signal);
  } catch (error) {
    if (isSkippable(error)) {
      yield failure(error, "course", false);
      return;
    }
    throw error;
  }
  const lessons = listing.lessons.filter((lesson) => lesson.lessonVersionId);
  const pending = pendingOf(run, lessons);
  if (pending.length === 0) {
    return;
  }
  let enrollmentId = enrollmentFrom(lessons, listing.enrollmentId);
  if (!(enrollmentId || run.dryRun)) {
    enrollmentId = await enrol(run, code);
    if (!enrollmentId) {
      yield failure(
        new Error(`enrolled in ${code} but no enrolment id came back`),
        "course",
        false
      );
      return;
    }
  }
  yield {
    bonus: course.bonusExp ?? null,
    code,
    event: "course",
    exp: course.baseExp ?? null,
    lessons: pending.length,
    title: titleOf(course),
  };
  for (const { kind, lesson } of pending) {
    if (limitReached(run)) {
      return;
    }
    yield* learnLesson(run, code, enrollmentId ?? "", lesson, kind);
  }
};

const expEvent = async (
  run: Run,
  phase: "before" | "after"
): Promise<LearnEvent> => {
  try {
    const payload = await readSessionExp(run.cookie, run.signal);
    const monthly = monthlyExpOf(payload);
    if (monthly !== undefined) {
      run.monthly = monthly;
    }
    return { event: "exp", monthly: monthly ?? null, phase };
  } catch (error) {
    return failure(error, "session", phase === "before");
  }
};

const readTier = async (run: Run): Promise<SessionTier | undefined> => {
  try {
    return await readSessionTier(run.cookie, run.signal);
  } catch {
    return undefined;
  }
};

/** The tier's price list as it sends it, for when the period's figure cannot be read. */
const lessonExpOf = async (run: Run): Promise<ReadonlyMap<string, number>> => {
  const priced = new Map<string, number>();
  const tier = await readTier(run);
  for (const entry of tier?.member?.lessonTypeExp ?? []) {
    if (entry.lessonType && entry.exp !== undefined) {
      priced.set(entry.lessonType.toLowerCase(), entry.exp);
    }
  }
  return priced;
};

/**
 * The account's whole catalogue, page by page. Exported because the run is not
 * the only reader: GET /v1/lms/courses answers with the same listing, so a
 * caller can see what a run would have to choose from.
 */
export const readCatalogue = async (
  cookie: string,
  signal?: AbortSignal
): Promise<Course[]> => {
  const courses: Course[] = [];
  // oxlint-disable no-await-in-loop
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const listing = await listCourses(cookie, page, PAGE_SIZE, signal);
    if (listing.courses.length === 0) {
      break;
    }
    courses.push(...listing.courses);
    const total = listing.total ?? undefined;
    if (total !== undefined && page * PAGE_SIZE >= total) {
      break;
    }
  }
  // oxlint-enable no-await-in-loop
  return courses;
};

/** Every course when the run named none, else the ones it named. */
const chosen = (run: Run, course: Course): boolean =>
  run.courses.size === 0 || run.courses.has(courseCode(course) ?? "");

/** What is left to learn: the courses already opened first, catalogue order within each. */
const toLearn = (run: Run, catalogue: readonly Course[]): Course[] => {
  const open = catalogue.filter(
    (course) => !isDone(course) && chosen(run, course)
  );
  return [
    ...open.filter((course) => isStarted(course)),
    ...open.filter((course) => !isStarted(course)),
  ];
};

/** A code the run named that the account's catalogue does not carry. */
const missing = (run: Run, catalogue: readonly Course[]): string[] => {
  const known = new Set(catalogue.map((course) => courseCode(course)));
  return [...run.courses].filter((code) => !known.has(code));
};

// Walks the catalogue; the return value says why it stopped.
const learnPages = async function* learnPages(
  run: Run
): AsyncGenerator<LearnEvent, string> {
  const catalogue = await readCatalogue(run.cookie, run.signal);
  for (const code of missing(run, catalogue)) {
    yield failure(
      new Error(`course ${code} is not in the account's catalogue`),
      "course",
      false
    );
  }
  for (const course of toLearn(run, catalogue)) {
    yield* learnCourse(run, course);
    const reason = limitReached(run);
    if (reason) {
      return reason;
    }
  }
  return "no more lessons to learn";
};

/** Video always; the readings unless they are turned off, quizzes only when asked. */
const kindsOf = (options: LearnOptions): ReadonlySet<LessonKind> => {
  const kinds = new Set<LessonKind>(["video"]);
  if (options.attachments ?? true) {
    kinds.add("attachment");
  }
  if (options.articles ?? true) {
    kinds.add("article");
  }
  if (options.quiz) {
    kinds.add("quiz");
  }
  return kinds;
};

// The whole run, as a stream of events ending on `done`.
export const learn = async function* learn(
  options: LearnOptions
): AsyncGenerator<LearnEvent> {
  const now = options.now ?? Date.now;
  const run: Run = {
    answer:
      options.answer ??
      modelAnswerer(options.cookie, options.quizModel ?? DEFAULT_QUIZ_MODEL),
    cookie: options.cookie,
    courses: new Set(options.courses),
    deadline:
      options.budgetMs === undefined ? undefined : now() + options.budgetMs,
    dryRun: options.dryRun ?? false,
    earn: options.earn,
    earned: 0,
    interval: options.stampIntervalS ?? STAMP_INTERVAL_S,
    kinds: kindsOf(options),
    lessonExp: new Map(),
    lessons: 0,
    maxLessons: options.maxLessons ?? DEFAULT_MAX_LESSONS,
    monthly: undefined,
    now,
    pace: options.pace ?? DEFAULT_PACE,
    paused: false,
    signal: options.signal,
    sleep: options.sleep ?? pause,
    target: options.target ?? DEFAULT_TARGET,
  };
  const done = (reached: boolean, reason: string): LearnEvent => ({
    earned: run.earned,
    event: "done",
    lessons: run.lessons,
    monthly: run.monthly ?? null,
    paused: run.paused,
    reached,
    reason,
    target: run.earn ?? run.target,
  });
  const before = await expEvent(run, "before");
  yield before;
  if (before.event === "error") {
    yield done(false, "the LMS refused the session");
    return;
  }
  if (run.earn === undefined && targetReached(run)) {
    yield done(true, "the period already has the target");
    return;
  }
  run.lessonExp = await lessonExpOf(run);
  let reason: string;
  try {
    reason = yield* learnPages(run);
  } catch (error) {
    yield failure(error, "lesson", true);
    reason = isAuthFailure(error)
      ? "the LMS refused the session"
      : "a lesson call failed, see the error event";
  }
  yield await expEvent(run, "after");
  yield done(targetReached(run), reason);
};
