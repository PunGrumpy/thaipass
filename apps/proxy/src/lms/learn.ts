import {
  completeCourse,
  enrollCourse,
  listCourses,
  listLessons,
  openLesson,
  readSessionExp,
  readSessionTier,
  stampVideo,
} from "./api";
import type {
  Course,
  Lesson,
  LessonContent,
  SessionExp,
  VideoStamp,
} from "./api";
import { findNumber } from "./payload";
import { LmsError } from "./request";

/**
 * Replays what the lesson page does for a video lesson: open it, stamp the
 * seconds watched as the video plays, and close the course once a stamp
 * reports the lesson complete. The LMS awards EXP per completed lesson, and
 * the run stops once it has earned the target.
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
const VIDEO = "video";
const COMPLETED = "COMPLETED";

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

/** The routes take the course code; a bare id carries a `course-` prefix the web client strips. */
export const courseCode = (course: Course): string | undefined =>
  course.code || course.id?.replace(/^course-/u, "") || undefined;

export const isVideo = (lesson: Lesson): boolean =>
  lesson.lessonType?.toLowerCase() === VIDEO;

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
      readonly videos: number;
    }
  | {
      readonly event: "lesson";
      readonly code: string;
      readonly lesson: string;
      readonly title: string | null;
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
  /** Set when a lesson stopped for the budget rather than for the LMS. */
  paused: boolean;
  videoExp: number | undefined;
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

const titleOf = (record: Course | Lesson): string | null =>
  record.title ?? null;

/** Best effort: the figure prices a lesson and is reported, the run does not depend on it. */
const readMonthly = async (run: Run): Promise<number | undefined> => {
  try {
    return monthlyExpOf(await readSessionExp(run.cookie, run.signal));
  } catch {
    return undefined;
  }
};

/** What the LMS added for the lesson, or the tier's figure when it cannot be read. */
const settleLesson = async (run: Run): Promise<number> => {
  const before = run.monthly;
  const after = await readMonthly(run);
  if (after !== undefined) {
    run.monthly = after;
  }
  if (before !== undefined && after !== undefined) {
    return Math.max(0, after - before);
  }
  return run.videoExp ?? 0;
};

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

// Learns one video lesson; true when the lesson was completed.
const learnLesson = async function* learnLesson(
  run: Run,
  code: string,
  enrollmentId: string,
  lesson: Lesson
): AsyncGenerator<LearnEvent, boolean> {
  const id = lesson.lessonVersionId ?? "";
  const title = titleOf(lesson);
  if (run.dryRun) {
    run.lessons += 1;
    run.earned += run.videoExp ?? 0;
    yield {
      code,
      duration: positive(lesson.durationSeconds ?? lesson.durationInSeconds),
      earned: run.earned,
      event: "lesson",
      exp: run.videoExp,
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
  const skip = (reason: string): LearnEvent => ({
    code,
    event: "lesson",
    lesson: id,
    reason,
    status: "skipped",
    title,
  });
  const duration = durationOf(content, lesson);
  if (!duration) {
    yield skip("no video duration in the lesson content");
    return false;
  }
  if (!content.videoContent?.videoContentId) {
    yield skip("no video content id in the lesson content");
    return false;
  }
  if (content.lessonProgressStatus?.toUpperCase() === COMPLETED) {
    yield skip("the LMS already marks this lesson complete");
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
      lesson: id,
      reason: `${TIME_BUDGET_SPENT}; the next call resumes from the last stamp`,
      status: "paused",
      title,
    };
    return false;
  }
  if (status?.toUpperCase() !== COMPLETED) {
    yield skip(
      `the LMS left the lesson ${status ?? "without a status"} after the last stamp`
    );
    return false;
  }
  // The page asks the course to close after every completed video; the LMS decides whether it can.
  try {
    await completeCourse(run.cookie, code, id, { enrollmentId }, run.signal);
    yield { code, event: "course_completed" };
  } catch (error) {
    yield failure(error, "course", false);
  }
  const exp = await settleLesson(run);
  run.earned += exp;
  run.lessons += 1;
  yield {
    code,
    earned: run.earned,
    event: "lesson",
    exp,
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
  const pending = lessons.filter(
    (lesson) => isVideo(lesson) && !isDone(lesson)
  );
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
    code,
    event: "course",
    title: titleOf(course),
    videos: pending.length,
  };
  for (const lesson of pending) {
    if (limitReached(run)) {
      return;
    }
    yield* learnLesson(run, code, enrollmentId ?? "", lesson);
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

/** The tier names what a video lesson pays, for when the period's figure cannot be read. */
const videoExpOf = async (run: Run): Promise<number | undefined> => {
  try {
    const tier = await readSessionTier(run.cookie, run.signal);
    return tier.member?.lessonTypeExp?.find(
      (entry) => entry.lessonType?.toLowerCase() === VIDEO
    )?.exp;
  } catch {
    return undefined;
  }
};

// Walks the catalogue a page at a time; the return value says why it stopped.
const learnPages = async function* learnPages(
  run: Run
): AsyncGenerator<LearnEvent, string> {
  // oxlint-disable no-await-in-loop
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const listing = await listCourses(run.cookie, page, PAGE_SIZE, run.signal);
    if (listing.courses.length === 0) {
      break;
    }
    for (const course of listing.courses) {
      if (!isDone(course)) {
        yield* learnCourse(run, course);
      }
      const reason = limitReached(run);
      if (reason) {
        return reason;
      }
    }
    const total = listing.total ?? undefined;
    if (total !== undefined && page * PAGE_SIZE >= total) {
      break;
    }
  }
  // oxlint-enable no-await-in-loop
  return "no more video lessons to learn";
};

// The whole run, as a stream of events ending on `done`.
export const learn = async function* learn(
  options: LearnOptions
): AsyncGenerator<LearnEvent> {
  const now = options.now ?? Date.now;
  const run: Run = {
    cookie: options.cookie,
    deadline:
      options.budgetMs === undefined ? undefined : now() + options.budgetMs,
    dryRun: options.dryRun ?? false,
    earn: options.earn,
    earned: 0,
    interval: options.stampIntervalS ?? STAMP_INTERVAL_S,
    lessons: 0,
    maxLessons: options.maxLessons ?? DEFAULT_MAX_LESSONS,
    monthly: undefined,
    now,
    pace: options.pace ?? DEFAULT_PACE,
    paused: false,
    signal: options.signal,
    sleep: options.sleep ?? pause,
    target: options.target ?? DEFAULT_TARGET,
    videoExp: undefined,
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
  run.videoExp = await videoExpOf(run);
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
