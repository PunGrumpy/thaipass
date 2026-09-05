import {
  completeCourse,
  completeLesson,
  enrollCourse,
  listCourses,
  listLessons,
  openLesson,
  readSessionExp,
  readSessionTier,
  stampVideo,
} from "./api";
import type {
  Completion,
  Course,
  Lesson,
  LessonContent,
  SessionExp,
} from "./api";
import { findNumber, findPayload, numberishSchema } from "./payload";
import { LmsError } from "./request";

/**
 * Replays what the lesson page does for a video lesson: open it, stamp the
 * playhead as it advances, mark the lesson complete. The LMS awards EXP per
 * completed lesson, and the run stops once it has earned the target.
 */

export const DEFAULT_TARGET = 100;
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

const DURATION_KEYS = [
  "durationInSeconds",
  "videoDuration",
  "durationSeconds",
  "duration",
] as const;

const TIME_KEYS = [
  "currentTime",
  "stampTime",
  "timestamp",
  "watchedSeconds",
  "seconds",
  "second",
  "position",
  "time",
] as const;

const STAMP_KEYS = [
  "videoStamp",
  "lastVideoStamp",
  "lastStamp",
  "stamp",
  "videoProgress",
] as const;

const EXP_KEYS = [
  "earnedExp",
  "expEarned",
  "exp",
  "earnedPoints",
  "points",
] as const;

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

const DONE_STATUSES = new Set(["COMPLETED", "COMPLETE", "DONE", "PASSED"]);

/** A course or a lesson the account has already finished; the LMS marks both the same ways. */
export const isDone = (record: Course | Lesson): boolean => {
  if (record.isCompleted === true || record.completed === true) {
    return true;
  }
  const status = record.learnerStatus ?? record.status;
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

export const durationOf = (
  content: LessonContent,
  lesson: Lesson
): number | undefined =>
  findNumber(content, DURATION_KEYS) ?? positive(lesson.durationInSeconds);

/** The field names a video stamp is sent under. */
export interface StampFields {
  readonly timeKey: string;
  readonly durationKey: string | undefined;
}

const DEFAULT_STAMP_FIELDS: StampFields = {
  durationKey: "duration",
  timeKey: "currentTime",
};

/**
 * Mirrors the stamp the LMS sends back inside the lesson content, when it
 * sends one. The player's own field names are not in the public bundle, so
 * the default is the HTML video property the player reads.
 */
export const stampFieldsOf = (content: LessonContent): StampFields => {
  const stamp = findPayload(content, STAMP_KEYS);
  if (!stamp) {
    return DEFAULT_STAMP_FIELDS;
  }
  const isNumber = (key: string): boolean =>
    numberishSchema.safeParse(stamp[key]).success;
  const timeKey = TIME_KEYS.find(isNumber);
  if (!timeKey) {
    return DEFAULT_STAMP_FIELDS;
  }
  return { durationKey: DURATION_KEYS.find(isNumber), timeKey };
};

export const stampBody = (
  fields: StampFields,
  currentTime: number,
  duration: number
): Record<string, number> =>
  fields.durationKey
    ? { [fields.timeKey]: currentTime, [fields.durationKey]: duration }
    : { [fields.timeKey]: currentTime };

/** Every `interval` seconds of playback, and the end of the video last. */
export const planStamps = (
  duration: number,
  interval = STAMP_INTERVAL_S
): number[] => {
  const stamps: number[] = [];
  for (let at = interval; at < duration; at += interval) {
    stamps.push(at);
  }
  stamps.push(duration);
  return stamps;
};

/** The month's figure, only from a key that names the period's earnings. */
export const monthlyExpOf = (payload: SessionExp): number | undefined =>
  findNumber(payload, MONTHLY_KEYS, true);

export const expOf = (completion: Completion): number | undefined =>
  findNumber(completion, EXP_KEYS, true);

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

export type LessonStatus = "planned" | "started" | "skipped" | "completed";

export type ErrorScope = "course" | "lesson" | "session";

export type LearnEvent =
  | {
      readonly event: "exp";
      readonly phase: "before" | "after";
      readonly monthly: number | null;
      readonly payload: SessionExp;
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
      readonly stamp?: Record<string, number>;
      readonly keys?: readonly string[];
      readonly reason?: string;
      readonly exp?: number;
      readonly earned?: number;
    }
  | {
      readonly event: "stamp";
      readonly code: string;
      readonly lesson: string;
      readonly at: number;
      readonly duration: number;
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
      readonly target: number;
      readonly reached: boolean;
      readonly reason: string;
    };

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface LearnOptions {
  readonly cookie: string;
  /** EXP to earn before stopping. */
  readonly target?: number;
  /** Playback speed: 1 stamps in real time, 4 gets through a video in a quarter of its length. */
  readonly pace?: number;
  readonly maxLessons?: number;
  /** Lists what would be learned and sends nothing that changes the account. */
  readonly dryRun?: boolean;
  readonly signal?: AbortSignal;
  readonly stampIntervalS?: number;
  readonly sleep?: Sleep;
}

interface Run {
  readonly cookie: string;
  readonly target: number;
  readonly pace: number;
  readonly maxLessons: number;
  readonly dryRun: boolean;
  readonly interval: number;
  readonly signal: AbortSignal | undefined;
  readonly sleep: Sleep;
  videoExp: number | undefined;
  earned: number;
  lessons: number;
}

const limitReached = (run: Run): string | undefined => {
  if (run.signal?.aborted) {
    return "the caller went away";
  }
  if (run.earned >= run.target) {
    return "target reached";
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
      duration: positive(lesson.durationInSeconds),
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
  const duration = durationOf(content, lesson);
  if (!duration) {
    yield {
      code,
      event: "lesson",
      keys: Object.keys(content),
      lesson: id,
      reason: "no video duration in the lesson content",
      status: "skipped",
      title,
    };
    return false;
  }
  const fields = stampFieldsOf(content);
  yield {
    code,
    duration,
    event: "lesson",
    keys: Object.keys(content),
    lesson: id,
    stamp: stampBody(fields, 0, duration),
    status: "started",
    title,
  };
  let previous = 0;
  // oxlint-disable no-await-in-loop
  for (const at of planStamps(duration, run.interval)) {
    await run.sleep(((at - previous) / run.pace) * MS_PER_S, run.signal);
    if (run.signal?.aborted) {
      return false;
    }
    await stampVideo(
      run.cookie,
      code,
      id,
      stampBody(fields, at, duration),
      run.signal
    );
    yield { at, code, duration, event: "stamp", lesson: id };
    previous = at;
  }
  // oxlint-enable no-await-in-loop
  const completion = await completeLesson(run.cookie, code, id, run.signal);
  const exp = expOf(completion) ?? run.videoExp ?? 0;
  run.earned += exp;
  run.lessons += 1;
  yield {
    code,
    earned: run.earned,
    event: "lesson",
    exp,
    lesson: id,
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

// Learns every open video lesson of one course, then closes the course.
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
  const open = lessons.filter((lesson) => !isDone(lesson));
  const pending = open.filter(isVideo);
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
  let completed = 0;
  let last = "";
  // oxlint-disable no-await-in-loop
  for (const lesson of pending) {
    if (limitReached(run)) {
      return;
    }
    const done = yield* learnLesson(run, code, enrollmentId ?? "", lesson);
    if (done) {
      completed += 1;
      last = lesson.lessonVersionId ?? "";
    }
  }
  // oxlint-enable no-await-in-loop
  // Only the last lesson of a course closes it, and only when nothing else is open.
  if (run.dryRun || completed !== open.length) {
    return;
  }
  try {
    await completeCourse(run.cookie, code, last, run.signal);
    yield { code, event: "course_completed" };
  } catch (error) {
    yield failure(error, "course", false);
  }
};

const expEvent = async (
  run: Run,
  phase: "before" | "after"
): Promise<LearnEvent> => {
  try {
    const payload = await readSessionExp(run.cookie, run.signal);
    return {
      event: "exp",
      monthly: monthlyExpOf(payload) ?? null,
      payload,
      phase,
    };
  } catch (error) {
    return failure(error, "session", phase === "before");
  }
};

/** The tier names what a video lesson pays, for when a completion does not. */
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
  const run: Run = {
    cookie: options.cookie,
    dryRun: options.dryRun ?? false,
    earned: 0,
    interval: options.stampIntervalS ?? STAMP_INTERVAL_S,
    lessons: 0,
    maxLessons: options.maxLessons ?? DEFAULT_MAX_LESSONS,
    pace: options.pace ?? DEFAULT_PACE,
    signal: options.signal,
    sleep: options.sleep ?? pause,
    target: options.target ?? DEFAULT_TARGET,
    videoExp: undefined,
  };
  const before = await expEvent(run, "before");
  yield before;
  if (before.event === "error") {
    yield {
      earned: 0,
      event: "done",
      lessons: 0,
      reached: false,
      reason: "the LMS refused the session",
      target: run.target,
    };
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
  yield {
    earned: run.earned,
    event: "done",
    lessons: run.lessons,
    reached: run.earned >= run.target,
    reason,
    target: run.target,
  };
};
