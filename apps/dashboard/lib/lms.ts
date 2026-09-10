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
