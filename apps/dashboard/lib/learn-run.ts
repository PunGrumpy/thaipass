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

export const MAX_PACE = 16;
export const MAX_LESSONS = 200;
export const MAX_COURSES = 50;
export const DEFAULT_MAX_LESSONS = 50;
export const DEFAULT_QUIZ_MODEL = "gemini-3.1-pro-preview";
export const PACE_STEPS = [1, 2, 4, 8, 16] as const;

export type RunGoal = "earn" | "target";

export interface RunOptions {
  amount: number;
  articles: boolean;
  attachments: boolean;
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

export const plannedSeconds = (state: RunState): number => {
  let total = 0;
  for (const course of state.courses) {
    for (const lesson of course.lessons) {
      if (lesson.status === "planned") {
        total += lesson.duration ?? 0;
      }
    }
  }
  return total;
};

export type RunField = "amount" | "courses" | "maxLessons";

export type RunCheck =
  | { body: LearnRunBody; ok: true }
  | { field: RunField; ok: false };

const isWhole = (value: number, least: number, most: number): boolean =>
  Number.isInteger(value) && value >= least && value <= most;

export const checkRun = (options: RunOptions, dryRun: boolean): RunCheck => {
  if (!isWhole(options.amount, 1, Number.MAX_SAFE_INTEGER)) {
    return { field: "amount", ok: false };
  }
  if (!isWhole(options.maxLessons, 1, MAX_LESSONS)) {
    return { field: "maxLessons", ok: false };
  }

  const codes = options.courses;
  if (codes.length > MAX_COURSES) {
    return { field: "courses", ok: false };
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
  id: string;
  kind: LessonKind;
  quiz: RunQuiz | null;
  reason: string | null;
  status: LessonStatus;
  title: string;
  watched: number | null;
}

export interface RunCourse {
  bonus: number | null;
  closed: boolean;
  code: string;
  exp: number | null;
  lessons: readonly RunLesson[];
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
  active: string | null;
  before: number | null;
  courses: readonly RunCourse[];
  failures: readonly RunFailure[];
  monthly: number | null;
  preview: boolean;
  stopped: boolean;
  summary: LearnDoneEvent | null;
}

export const EMPTY_RUN: RunState = {
  active: null,
  before: null,
  courses: [],
  failures: [],
  monthly: null,
  preview: false,
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
  | { kind: "reset"; preview: boolean }
  | { kind: "stopped" };

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
    return { ...EMPTY_RUN, preview: action.preview };
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

export const isResumable = (state: RunState): boolean =>
  state.stopped || state.summary?.paused === true;
