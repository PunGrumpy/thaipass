// oxlint-disable promise/prefer-await-to-then -- every `.catch()` below is zod's parse fallback, not a promise handler.
import { z } from "zod";

import { attempt } from "./attempt";
import { gatewayFetch, normalizeProxyUrl } from "./proxy";

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
  monthly: number | null;
  normalCourseExp: number | null;
  perLessonType: readonly LessonTypeExp[];
}

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

export interface LmsCourse {
  bonus: number | null;
  code: string;
  done: boolean;
  duration: number | null;
  exp: number | null;
  progress: number | null;
  started: boolean;
  title: string | null;
}

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

  const last = parseLearnEvent(buffer);
  if (last) {
    onEvent(last);
  }
};
