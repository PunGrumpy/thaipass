import { MONTHLY_TARGET } from "./lms";
import type {
  LearnCourseEvent,
  LearnDoneEvent,
  LearnErrorEvent,
  LearnEvent,
  LearnExpEvent,
  LearnLessonEvent,
  LearnQuizEvent,
  LearnRunBody,
  LearnStampEvent,
  LessonKind,
  LessonStatus,
} from "./lms";

/*
 * The form's own copy of what POST /v1/lms/learn accepts, so a value the proxy
 * would reject is caught in the field rather than as a 400 halfway down the
 * page. These have to track `learnRequestSchema` in apps/proxy.
 */
export const MAX_PACE = 16;
export const MAX_LESSONS = 200;
export const MAX_COURSES = 50;
export const DEFAULT_MAX_LESSONS = 50;
/** The proxy's own default answerer; named here so the field can show it. */
export const DEFAULT_QUIZ_MODEL = "gemini-3.1-pro-preview";
export const PACE_STEPS = [1, 2, 4, 8, 16] as const;

/** Reach a figure for the period, or earn a figure in this run whatever it holds. */
export type RunGoal = "earn" | "target";

export interface RunOptions {
  /** EXP, read as the period total or as this run's earnings by `goal`. */
  amount: number;
  articles: boolean;
  attachments: boolean;
  /** Course codes picked from the catalogue; empty covers all of it. */
  courses: readonly string[];
  goal: RunGoal;
  maxLessons: number;
  pace: number;
  quiz: boolean;
  quizModel: string;
}

export const DEFAULT_RUN_OPTIONS: RunOptions = {
  amount: MONTHLY_TARGET,
  articles: true,
  attachments: true,
  courses: [],
  goal: "target",
  maxLessons: DEFAULT_MAX_LESSONS,
  pace: 1,
  quiz: false,
  quizModel: DEFAULT_QUIZ_MODEL,
};

export type RunField = "amount" | "courses" | "maxLessons";

export type RunCheck =
  | { body: LearnRunBody; ok: true }
  | { field: RunField; message: string; ok: false };

const isWhole = (value: number, least: number, most: number): boolean =>
  Number.isInteger(value) && value >= least && value <= most;

/** The body to send, or the one field to point at and why. */
export const checkRun = (options: RunOptions, dryRun: boolean): RunCheck => {
  if (!isWhole(options.amount, 1, Number.MAX_SAFE_INTEGER)) {
    return {
      field: "amount",
      message: "Give a whole number of EXP, 1 or more.",
      ok: false,
    };
  }
  if (!isWhole(options.maxLessons, 1, MAX_LESSONS)) {
    return {
      field: "maxLessons",
      message: `Lessons per run goes from 1 to ${MAX_LESSONS}.`,
      ok: false,
    };
  }

  const codes = options.courses;
  if (codes.length > MAX_COURSES) {
    return {
      field: "courses",
      message: `Name at most ${MAX_COURSES} courses.`,
      ok: false,
    };
  }

  const body: LearnRunBody = {
    articles: options.articles,
    attachments: options.attachments,
    dry_run: dryRun,
    max_lessons: options.maxLessons,
    pace: options.pace,
    quiz: options.quiz,
  };
  if (codes.length > 0) {
    body.courses = codes;
  }
  if (options.goal === "earn") {
    body.earn = options.amount;
  } else {
    body.target = options.amount;
  }
  if (options.quiz) {
    body.quiz_model = options.quizModel;
  }

  return { body, ok: true };
};

/*
 * The stream is a flat sequence, but what it describes is a tree: courses, the
 * lessons under each, and one lesson in progress. Folding it back into that
 * shape is what lets the feed update a row in place instead of printing a log
 * nobody can read at a glance.
 */

export interface RunQuiz {
  answered: number;
  passed: boolean | null;
  questions: number;
  score: number | null;
  total: number | null;
}

export interface RunLesson {
  duration: number | null;
  exp: number | null;
  /** `${course code}:${lesson id}`, unique across the run. */
  id: string;
  kind: LessonKind;
  quiz: RunQuiz | null;
  reason: string | null;
  status: LessonStatus;
  title: string;
  watched: number | null;
}

export interface RunCourse {
  /** Paid once the course closes, where the LMS names one. */
  bonus: number | null;
  closed: boolean;
  code: string;
  /** What the course itself pays, apart from its lessons. */
  exp: number | null;
  lessons: readonly RunLesson[];
  /** Open lessons the run found in the course. */
  planned: number;
  title: string | null;
}

export interface RunFailure {
  detail: string | null;
  fatal: boolean;
  key: string;
  message: string;
  scope: "course" | "lesson" | "session";
}

export interface RunState {
  /** The lesson being learned, so the feed can show it in progress. */
  active: string | null;
  /** The period's EXP as the run first read it, for the earned figure. */
  before: number | null;
  courses: readonly RunCourse[];
  failures: readonly RunFailure[];
  monthly: number | null;
  /** The reader stopped the run, so it ended with no `done` line of its own. */
  stopped: boolean;
  summary: LearnDoneEvent | null;
}

export const EMPTY_RUN: RunState = {
  active: null,
  before: null,
  courses: [],
  failures: [],
  monthly: null,
  stopped: false,
  summary: null,
};

const lessonId = (code: string, lesson: string): string => `${code}:${lesson}`;

const withCourse = (
  courses: readonly RunCourse[],
  code: string,
  patch: (course: RunCourse) => RunCourse
): readonly RunCourse[] => {
  const known = courses.some((course) => course.code === code);
  const rows = known
    ? courses
    : [
        ...courses,
        {
          bonus: null,
          closed: false,
          code,
          exp: null,
          lessons: [],
          planned: 0,
          title: null,
        },
      ];
  return rows.map((course) => (course.code === code ? patch(course) : course));
};

const applyExp = (state: RunState, event: LearnExpEvent): RunState => ({
  ...state,
  before: event.phase === "before" ? event.monthly : state.before,
  monthly: event.monthly ?? state.monthly,
});

const applyCourse = (state: RunState, event: LearnCourseEvent): RunState => ({
  ...state,
  courses: withCourse(state.courses, event.code, (course) => ({
    ...course,
    bonus: event.bonus ?? course.bonus,
    exp: event.exp ?? course.exp,
    planned: event.lessons,
    title: event.title ?? course.title,
  })),
});

/**
 * A later event carries only what changed, so `completed` arrives without the
 * duration `started` set. Merging keeps what the row already knows.
 */
const mergeLesson = (
  previous: RunLesson | undefined,
  event: LearnLessonEvent,
  id: string
): RunLesson => ({
  duration: event.duration ?? previous?.duration ?? null,
  exp: event.exp ?? previous?.exp ?? null,
  id,
  kind: event.kind,
  quiz: previous?.quiz ?? null,
  reason: event.reason ?? null,
  status: event.status,
  title: event.title ?? previous?.title ?? event.lesson,
  watched: event.watched ?? previous?.watched ?? null,
});

const nextActive = (
  previous: string | null,
  id: string,
  status: LessonStatus
): string | null => {
  if (status === "started") {
    return id;
  }
  return previous === id ? null : previous;
};

const applyLesson = (state: RunState, event: LearnLessonEvent): RunState => {
  const id = lessonId(event.code, event.lesson);
  return {
    ...state,
    active: nextActive(state.active, id, event.status),
    courses: withCourse(state.courses, event.code, (course) => {
      const known = course.lessons.some((lesson) => lesson.id === id);
      const merged = mergeLesson(
        course.lessons.find((lesson) => lesson.id === id),
        event,
        id
      );
      return {
        ...course,
        lessons: known
          ? course.lessons.map((lesson) => (lesson.id === id ? merged : lesson))
          : [...course.lessons, merged],
      };
    }),
    monthly: event.monthly ?? state.monthly,
  };
};

const patchLesson = (
  state: RunState,
  code: string,
  id: string,
  patch: (lesson: RunLesson) => RunLesson
): RunState => ({
  ...state,
  courses: withCourse(state.courses, code, (course) => ({
    ...course,
    lessons: course.lessons.map((lesson) =>
      lesson.id === id ? patch(lesson) : lesson
    ),
  })),
});

const applyStamp = (state: RunState, event: LearnStampEvent): RunState =>
  patchLesson(
    state,
    event.code,
    lessonId(event.code, event.lesson),
    (lesson) => ({ ...lesson, duration: event.duration, watched: event.at })
  );

const applyQuiz = (state: RunState, event: LearnQuizEvent): RunState =>
  patchLesson(
    state,
    event.code,
    lessonId(event.code, event.lesson),
    (lesson) => ({
      ...lesson,
      quiz: {
        answered: event.answered,
        passed: event.passed,
        questions: event.questions,
        score: event.score,
        total: event.total,
      },
    })
  );

const applyError = (state: RunState, event: LearnErrorEvent): RunState => ({
  ...state,
  failures: [
    ...state.failures,
    {
      detail: event.detail,
      fatal: event.fatal,
      key: `${state.failures.length}:${event.scope}:${event.code ?? ""}`,
      message: event.message,
      scope: event.scope,
    },
  ],
});

const applyDone = (state: RunState, event: LearnDoneEvent): RunState => ({
  ...state,
  active: null,
  monthly: event.monthly ?? state.monthly,
  summary: event,
});

export type RunAction =
  | { event: LearnEvent; kind: "event" }
  | { kind: "reset" }
  | { kind: "stopped" };

/**
 * A stopped run sends no closing line, so the lesson it was on would otherwise
 * sit at "Learning" for good. The proxy picks up from the last stamp, which is
 * what paused already means everywhere else on this page.
 */
const applyStopped = (state: RunState): RunState => {
  const { active } = state;
  if (active === null) {
    return { ...state, stopped: true };
  }
  const [code = ""] = active.split(":");
  return {
    ...patchLesson(state, code, active, (lesson) => ({
      ...lesson,
      reason: "you stopped the run",
      status: "paused",
    })),
    active: null,
    stopped: true,
  };
};

export const runReducer = (state: RunState, action: RunAction): RunState => {
  if (action.kind === "reset") {
    return EMPTY_RUN;
  }
  if (action.kind === "stopped") {
    return applyStopped(state);
  }
  const { event } = action;
  switch (event.event) {
    case "exp": {
      return applyExp(state, event);
    }
    case "course": {
      return applyCourse(state, event);
    }
    case "lesson": {
      return applyLesson(state, event);
    }
    case "stamp": {
      return applyStamp(state, event);
    }
    case "quiz": {
      return applyQuiz(state, event);
    }
    case "course_completed": {
      return {
        ...state,
        courses: withCourse(state.courses, event.code, (course) => ({
          ...course,
          closed: true,
        })),
      };
    }
    case "error": {
      return applyError(state, event);
    }
    case "done": {
      return applyDone(state, event);
    }
    default: {
      return state;
    }
  }
};

export const activeLesson = (state: RunState): RunLesson | null => {
  if (state.active === null) {
    return null;
  }
  for (const course of state.courses) {
    const found = course.lessons.find((lesson) => lesson.id === state.active);
    if (found) {
      return found;
    }
  }
  return null;
};

export const isRunEmpty = (state: RunState): boolean =>
  state.courses.length === 0 &&
  state.failures.length === 0 &&
  state.summary === null;

/** True while the last run has somewhere left to pick up from. */
export const isResumable = (state: RunState): boolean =>
  state.stopped || state.summary?.paused === true;
