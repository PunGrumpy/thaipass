import { z } from "zod";

import {
  findNumber,
  idSchema,
  lenient,
  numberishSchema,
  optionalIdSchema,
  payloadSchema,
} from "./payload";
import type { Payload } from "./payload";
import { lmsRequest } from "./request";
import type { LmsBody } from "./request";

/**
 * The LMS routes, as the web client's generated API layer names them. A field
 * that arrives in a form the proxy does not read is dropped rather than
 * failing the whole reply.
 */

const PERCENT_KEYS = ["percent", "percentage", "progress"] as const;

const statusSchema = lenient(
  z.union([
    z.string(),
    z.looseObject({ status: z.string().optional() }).transform((v) => v.status),
  ])
);

/** A percentage, whether sent bare or inside a progress object. */
const progressSchema = lenient(
  z.union([
    numberishSchema,
    payloadSchema.transform((p) => findNumber(p, PERCENT_KEYS, true)),
  ])
);

const optionalNumberSchema = lenient(numberishSchema);
const optionalTextSchema = lenient(z.string());
const optionalFlagSchema = lenient(z.boolean());

/** The ways the LMS marks a course or a lesson as finished. */
const completionFieldsSchema = z.looseObject({
  completed: optionalFlagSchema,
  isCompleted: optionalFlagSchema,
  learnerStatus: statusSchema,
  progress: progressSchema,
  status: optionalTextSchema,
  title: optionalTextSchema,
});

export const courseSchema = completionFieldsSchema.extend({
  baseExp: optionalNumberSchema,
  bonusExp: optionalNumberSchema,
  code: optionalTextSchema,
  durationInSeconds: optionalNumberSchema,
  id: optionalIdSchema,
});

export const coursePageSchema = z.looseObject({
  courses: z.array(courseSchema).default([]),
  limit: optionalNumberSchema,
  page: optionalNumberSchema,
  total: optionalNumberSchema,
});

export const lessonSchema = completionFieldsSchema.extend({
  durationInSeconds: optionalNumberSchema,
  enrollmentId: optionalIdSchema,
  lessonType: optionalTextSchema,
  lessonVersionId: optionalIdSchema,
});

export const lessonListSchema = z.looseObject({
  enrollmentId: optionalIdSchema,
  lessons: z.array(lessonSchema).default([]),
});

const enrollmentFieldsSchema = z.looseObject({
  enrollmentId: optionalIdSchema,
  id: optionalIdSchema,
});

/** An enrolment answers with the id bare, in the object, or one level down. */
export const enrollmentIdSchema = lenient(
  z.union([
    enrollmentFieldsSchema
      .extend({ enrollment: lenient(enrollmentFieldsSchema) })
      .transform(
        (e) =>
          e.enrollmentId ??
          e.id ??
          e.enrollment?.enrollmentId ??
          e.enrollment?.id
      ),
    idSchema,
  ])
);

const lessonTypeExpSchema = z.looseObject({
  exp: optionalNumberSchema,
  lessonType: optionalTextSchema,
});

export const sessionTierSchema = z.looseObject({
  member: lenient(
    z.looseObject({
      lessonTypeExp: lenient(z.array(lessonTypeExpSchema)),
      normalCourseExp: optionalNumberSchema,
    })
  ),
});

/** A reply the proxy only inspects, read as an object or as nothing. */
const inspectedSchema = z.preprocess(
  (value) => (payloadSchema.safeParse(value).success ? value : {}),
  payloadSchema
);

export type Course = z.infer<typeof courseSchema>;
export type CoursePage = z.infer<typeof coursePageSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonList = z.infer<typeof lessonListSchema>;
export type SessionTier = z.infer<typeof sessionTierSchema>;
export type LessonContent = Payload;

/** The playhead and the seconds spent watching, as the lesson page stamps them. */
export interface VideoStamp extends LmsBody {
  readonly currentSeconds: number;
  readonly watchedSeconds: number;
}

/** The time spent on a lesson, sent when it closes. */
export interface LessonCompletion extends LmsBody {
  readonly watchedSeconds: number;
}
export type Completion = Payload;
export type SessionExp = Payload;
export type Achievement = Payload;

const segment = (id: string): string => encodeURIComponent(id);

const lessonPath = (codeId: string, lessonVersionId: string): string =>
  `/course/${segment(codeId)}/lesson/${segment(lessonVersionId)}`;

export const listCourses = (
  cookie: string,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<CoursePage> =>
  lmsRequest(
    cookie,
    "POST",
    "/course/v2",
    coursePageSchema,
    { limit, page },
    signal
  );

export const listLessons = (
  cookie: string,
  codeId: string,
  signal?: AbortSignal
): Promise<LessonList> =>
  lmsRequest(
    cookie,
    "GET",
    `/course/${segment(codeId)}/lesson`,
    lessonListSchema,
    undefined,
    signal
  );

/** Enrols, and returns the enrolment id when the reply names one. */
export const enrollCourse = (
  cookie: string,
  codeId: string,
  signal?: AbortSignal
): Promise<string | undefined> =>
  lmsRequest(
    cookie,
    "POST",
    `/course/${segment(codeId)}/enrollment`,
    enrollmentIdSchema,
    undefined,
    signal
  );

/** Opens the lesson the way the lesson page does; the reply is the lesson's content. */
export const openLesson = (
  cookie: string,
  codeId: string,
  lessonVersionId: string,
  enrollmentId: string,
  signal?: AbortSignal
): Promise<LessonContent> =>
  lmsRequest(
    cookie,
    "POST",
    lessonPath(codeId, lessonVersionId),
    inspectedSchema,
    { enrollmentId },
    signal
  );

export const stampVideo = (
  cookie: string,
  codeId: string,
  lessonVersionId: string,
  body: VideoStamp,
  signal?: AbortSignal
): Promise<Payload> =>
  lmsRequest(
    cookie,
    "PUT",
    `${lessonPath(codeId, lessonVersionId)}/video-stamp`,
    inspectedSchema,
    body,
    signal
  );

export const completeLesson = (
  cookie: string,
  codeId: string,
  lessonVersionId: string,
  body: LessonCompletion,
  signal?: AbortSignal
): Promise<Completion> =>
  lmsRequest(
    cookie,
    "PUT",
    `${lessonPath(codeId, lessonVersionId)}/lesson-completed`,
    inspectedSchema,
    body,
    signal
  );

export const completeCourse = (
  cookie: string,
  codeId: string,
  lessonVersionId: string,
  signal?: AbortSignal
): Promise<Completion> =>
  lmsRequest(
    cookie,
    "PUT",
    `${lessonPath(codeId, lessonVersionId)}/course-completed`,
    inspectedSchema,
    {},
    signal
  );

export const readSessionExp = (
  cookie: string,
  signal?: AbortSignal
): Promise<SessionExp> =>
  lmsRequest(
    cookie,
    "GET",
    "/session/session-exp",
    inspectedSchema,
    undefined,
    signal
  );

export const readSessionTier = (
  cookie: string,
  signal?: AbortSignal
): Promise<SessionTier> =>
  lmsRequest(
    cookie,
    "GET",
    "/session/session-tier",
    sessionTierSchema,
    undefined,
    signal
  );

export const readAchievement = (
  cookie: string,
  signal?: AbortSignal
): Promise<Achievement> =>
  lmsRequest(cookie, "GET", "/achievement", inspectedSchema, undefined, signal);
