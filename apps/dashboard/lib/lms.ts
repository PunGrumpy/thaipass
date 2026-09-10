// oxlint-disable promise/prefer-await-to-then -- every `.catch()` below is zod's parse fallback, not a promise handler.
import { z } from "zod";

import { attempt } from "./attempt";
import { gatewayFetch, normalizeProxyUrl } from "./proxy";

/**
 * The proxy types `session_exp` and `achievement` as `unknown` and hands the
 * LMS reply through untouched, so this is the boundary that gives it a shape.
 * Every branch is `.catch`ed: a field the LMS renames or drops becomes null
 * rather than throwing, because a partial reading beats an error page.
 */
const numberish = z.coerce.number().finite().nullable().catch(null);

const lessonTypeExpSchema = z
  .looseObject({ exp: numberish, lessonType: z.string() })
  .nullable()
  .catch(null);

const expResponseSchema = z.looseObject({
  monthly: numberish,
  session_tier: z
    .looseObject({
      member: z
        .looseObject({
          lessonTypeExp: z.array(lessonTypeExpSchema).catch([]),
          normalCourseExp: numberish,
        })
        .nullable()
        .catch(null),
    })
    .nullable()
    .catch(null),
});

const apiErrorSchema = z.looseObject({
  error: z.looseObject({ message: z.string() }).nullable().catch(null),
});

export interface LessonTypeExp {
  exp: number | null;
  lessonType: string;
}

export interface LearningExp {
  /** EXP earned this period, or null when the payload names no such field. */
  monthly: number | null;
  /** EXP for courses outside the lesson-type breakdown. */
  normalCourseExp: number | null;
  perLessonType: readonly LessonTypeExp[];
}

/** What `learn` aims at by default, and the only target the LMS surface names. */
export const MONTHLY_TARGET = 100;

const readLmsError = async (response: Response): Promise<string> => {
  const raw = await attempt(() => response.json());
  const body = apiErrorSchema.safeParse(raw.ok ? raw.data : null);
  return (
    body.data?.error?.message ??
    `HTTP ${response.status}: ${response.statusText}`
  );
};

export const fetchLearningExp = async (
  proxyUrl: string,
  cookie: string,
  signal?: AbortSignal
): Promise<LearningExp> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/v1/lms/exp`,
    {
      cache: "no-store",
      headers: { authorization: `Bearer ${cookie}` },
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(await readLmsError(response));
  }

  const payload = expResponseSchema.parse(await response.json());
  const member = payload.session_tier?.member ?? null;

  return {
    monthly: payload.monthly,
    normalCourseExp: member?.normalCourseExp ?? null,
    perLessonType: (member?.lessonTypeExp ?? []).filter((row) => row !== null),
  };
};

const courseSchema = z.looseObject({
  bonus_exp: z.number().nullable().catch(null),
  code: z.string(),
  done: z.boolean().catch(false),
  duration_seconds: z.number().nullable().catch(null),
  exp: z.number().nullable().catch(null),
  progress: z.number().nullable().catch(null),
  started: z.boolean().catch(false),
  title: z.string().nullable().catch(null),
});

const courseListSchema = z.looseObject({
  courses: z.array(courseSchema).catch([]),
});

/** A course as the picker reads it; the wire's snake_case stops at this file. */
export interface LmsCourse {
  /** Paid once the course closes, where it carries one. */
  bonus: number | null;
  code: string;
  done: boolean;
  duration: number | null;
  /** What the course itself pays, apart from its lessons. */
  exp: number | null;
  /** How far through the account already is, 0 to 100. */
  progress: number | null;
  started: boolean;
  title: string | null;
}

/**
 * Every course the account can reach, in the order a run would take them.
 * Read on demand rather than with the page: the proxy pages the whole
 * catalogue out of the LMS, which is many upstream calls for a list nobody
 * has asked to see yet.
 */
export const fetchCourses = async (
  proxyUrl: string,
  cookie: string,
  signal?: AbortSignal
): Promise<readonly LmsCourse[]> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/v1/lms/courses`,
    {
      cache: "no-store",
      headers: { authorization: `Bearer ${cookie}` },
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(await readLmsError(response));
  }

  const payload = courseListSchema.parse(await response.json());
  return payload.courses.map((course) => ({
    bonus: course.bonus_exp,
    code: course.code,
    done: course.done,
    duration: course.duration_seconds,
    exp: course.exp,
    progress: course.progress,
    started: course.started,
    title: course.title,
  }));
};

/*
 * A learning run: POST /v1/lms/learn streams one JSON object per line for as
 * long as the lessons take, so the dashboard follows the same events the CLI
 * prints. The union below mirrors the proxy's `LearnEvent`, and each variant is
 * parsed rather than cast: the run is a long stream, and one malformed line
 * should cost that line, not the whole run.
 */

const lessonKindSchema = z.enum(["article", "attachment", "quiz", "video"]);

const lessonStatusSchema = z.enum([
  "completed",
  "paused",
  "planned",
  "skipped",
  "started",
]);

const learnEventSchema = z.discriminatedUnion("event", [
  z.looseObject({
    event: z.literal("exp"),
    monthly: z.number().nullable().catch(null),
    phase: z.enum(["after", "before"]),
  }),
  z.looseObject({
    bonus: z.number().nullable().catch(null),
    code: z.string(),
    event: z.literal("course"),
    exp: z.number().nullable().catch(null),
    lessons: z.number().catch(0),
    title: z.string().nullable().catch(null),
  }),
  z.looseObject({
    code: z.string(),
    duration: z.number().optional(),
    earned: z.number().optional(),
    event: z.literal("lesson"),
    exp: z.number().optional(),
    kind: lessonKindSchema,
    lesson: z.string(),
    monthly: z.number().nullable().optional(),
    reason: z.string().optional(),
    status: lessonStatusSchema,
    title: z.string().nullable().catch(null),
    watched: z.number().optional(),
  }),
  z.looseObject({
    at: z.number(),
    code: z.string(),
    duration: z.number(),
    event: z.literal("stamp"),
    lesson: z.string(),
    status: z.string().nullable().catch(null),
  }),
  z.looseObject({
    answered: z.number().catch(0),
    code: z.string(),
    event: z.literal("quiz"),
    lesson: z.string(),
    passed: z.boolean().nullable().catch(null),
    questions: z.number().catch(0),
    score: z.number().nullable().catch(null),
    total: z.number().nullable().catch(null),
  }),
  z.looseObject({ code: z.string(), event: z.literal("course_completed") }),
  z.looseObject({
    code: z.string().nullable().catch(null),
    detail: z.string().nullable().catch(null),
    event: z.literal("error"),
    fatal: z.boolean().catch(false),
    message: z.string(),
    scope: z.enum(["course", "lesson", "session"]).catch("session"),
    status: z.number().catch(0),
  }),
  z.looseObject({
    earned: z.number().catch(0),
    event: z.literal("done"),
    lessons: z.number().catch(0),
    monthly: z.number().nullable().catch(null),
    paused: z.boolean().catch(false),
    reached: z.boolean().catch(false),
    reason: z.string().catch(""),
    target: z.number().catch(0),
  }),
]);

export type LessonKind = z.infer<typeof lessonKindSchema>;
export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export type LearnEvent = z.infer<typeof learnEventSchema>;
export type LearnCourseEvent = Extract<LearnEvent, { event: "course" }>;
export type LearnDoneEvent = Extract<LearnEvent, { event: "done" }>;
export type LearnErrorEvent = Extract<LearnEvent, { event: "error" }>;
export type LearnExpEvent = Extract<LearnEvent, { event: "exp" }>;
export type LearnLessonEvent = Extract<LearnEvent, { event: "lesson" }>;
export type LearnQuizEvent = Extract<LearnEvent, { event: "quiz" }>;
export type LearnStampEvent = Extract<LearnEvent, { event: "stamp" }>;

/** The request body, in the snake_case the proxy's schema names. */
export interface LearnRunBody {
  articles?: boolean;
  attachments?: boolean;
  courses?: readonly string[];
  dry_run?: boolean;
  earn?: number;
  max_lessons?: number;
  pace?: number;
  quiz?: boolean;
  quiz_model?: string;
  target?: number;
}

/** One NDJSON line, or null for a blank line and for one no variant matches. */
export const parseLearnEvent = (line: string): LearnEvent | null => {
  const trimmed = line.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const parsed = learnEventSchema.safeParse(JSON.parse(trimmed));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export interface StreamLearnParams {
  cookie: string;
  onEvent: (event: LearnEvent) => void;
  options: LearnRunBody;
  proxyUrl: string;
  signal: AbortSignal;
}

/**
 * Follows a run to its end. Nothing is buffered for the caller: each line is
 * handed over as it lands, because a stamp that arrives ten seconds late is
 * a progress bar that lies.
 */
export const streamLearnRun = async ({
  cookie,
  onEvent,
  options,
  proxyUrl,
  signal,
}: StreamLearnParams): Promise<void> => {
  const response = await gatewayFetch(
    `${normalizeProxyUrl(proxyUrl)}/v1/lms/learn`,
    {
      body: JSON.stringify(options),
      headers: {
        authorization: `Bearer ${cookie}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(await readLmsError(response));
  }
  if (!response.body) {
    throw new Error("The gateway returned no run to follow.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- an NDJSON body arrives in order; the next chunk cannot be asked for before this one lands.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseLearnEvent(line);
      if (event) {
        onEvent(event);
      }
    }
  }

  // A body that ends without a trailing newline leaves its last event here.
  const last = parseLearnEvent(buffer);
  if (last) {
    onEvent(last);
  }
};
