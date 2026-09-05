import { afterEach, expect, test } from "bun:test";

import { z } from "zod";

import { sseResponse, stubUpstream } from "../testing/upstream";
import type { Upstream } from "../testing/upstream";
import { courseSchema, enrollmentIdSchema, lessonSchema } from "./api";
import {
  courseCode,
  durationOf,
  isDone,
  learn,
  monthlyExpOf,
  planStamps,
  stampBody,
} from "./learn";
import type { LearnEvent } from "./learn";
import { findNumber } from "./payload";
import type { Payload } from "./payload";

const COOKIE = "__Secure-ai_passport_auth.session_token=abc.def";
const LMS = "/lms/api/v1";
const VIDEO_EXP = 30;
const MONTHLY = 40;
const NO_SLEEP = (): Promise<void> => Promise.resolve();

let upstream: Upstream;

afterEach(() => {
  upstream.restore();
});

const ok = (data: Payload | readonly Payload[]): Response =>
  Response.json({ data, success: true });

const refused = (): Response =>
  Response.json(
    {
      code: "INVALID_CREDENTIAL",
      message: "No authentication credentials provided",
      statusCode: 401,
      success: false,
    },
    { status: 401 }
  );

interface Fixture {
  readonly courses?: readonly Payload[];
  readonly lessons?: readonly Payload[];
  readonly content?: Payload;
  readonly completion?: Payload;
  readonly refuse?: string;
}

const asLesson = (value: Payload) => lessonSchema.parse(value);
const asCourse = (value: Payload) => courseSchema.parse(value);

const DEFAULT_COURSES = [
  { code: "done-1", learnerStatus: "COMPLETED", title: "Old" },
  { code: "c-2", learnerStatus: "IN_PROGRESS", title: "New" },
];

const DEFAULT_LESSONS = [
  {
    durationInSeconds: 25,
    enrollmentId: "",
    lessonType: "video",
    lessonVersionId: "l-1",
    title: "Intro",
  },
  { lessonType: "article", lessonVersionId: "l-2", title: "Read" },
];

const DEFAULT_CONTENT = {
  durationSeconds: 25,
  lessonProgressId: "p-1",
  videoContent: {
    currentSeconds: null,
    durationSeconds: 25,
    videoHlsMasterPlaylistUrl: "https://cdn.test/v.m3u8",
    watchedSeconds: null,
  },
};

/** The LMS as the lesson page sees it: one course with one video and one article. */
const lmsUpstream = (fixture: Fixture = {}): Upstream =>
  stubUpstream(sseResponse([]), (path) => {
    if (!path.startsWith(LMS)) {
      return;
    }
    const route = path.slice(LMS.length);
    if (fixture.refuse && route.startsWith(fixture.refuse)) {
      return refused();
    }
    if (route === "/session/session-exp") {
      return ok({ monthlyExp: MONTHLY, tier: "silver" });
    }
    if (route === "/session/session-tier") {
      return ok({
        member: { lessonTypeExp: [{ exp: VIDEO_EXP, lessonType: "video" }] },
      });
    }
    if (route === "/course/v2") {
      const pages = upstream.sent.filter((call) => call.path === path).length;
      const courses = pages <= 1 ? (fixture.courses ?? DEFAULT_COURSES) : [];
      return ok({ courses, limit: 20, page: pages, total: courses.length });
    }
    if (route === "/course/c-2/lesson") {
      return ok({ lessons: fixture.lessons ?? DEFAULT_LESSONS });
    }
    if (route === "/course/c-2/enrollment") {
      return ok({ enrollmentId: "e-9" });
    }
    if (route === "/course/c-2/lesson/l-1") {
      return ok(fixture.content ?? DEFAULT_CONTENT);
    }
    if (route.endsWith("/lesson-completed")) {
      return ok(fixture.completion ?? { exp: VIDEO_EXP });
    }
    return ok({});
  });

const collect = async (
  options: Parameters<typeof learn>[0]
): Promise<LearnEvent[]> => {
  const events: LearnEvent[] = [];
  for await (const event of learn(options)) {
    events.push(event);
  }
  return events;
};

const doneOf = (events: readonly LearnEvent[]) => {
  const done = events.at(-1);
  if (done?.event !== "done") {
    throw new Error(`no done event, got ${JSON.stringify(done)}`);
  }
  return done;
};

const errorOf = (events: readonly LearnEvent[]) => {
  const error = events.find((event) => event.event === "error");
  if (error?.event !== "error") {
    throw new Error("no error event");
  }
  return error;
};

const stampSchema = z.record(z.string(), z.number());

const stampsSent = (): Record<string, number>[] =>
  upstream.sent
    .filter((call) => call.path.endsWith("/video-stamp"))
    .map((call) => stampSchema.parse(JSON.parse(call.body)));

test("stamps every ten seconds and the end, then completes the lesson", async () => {
  upstream = lmsUpstream();
  const events = await collect({
    cookie: COOKIE,
    sleep: NO_SLEEP,
    target: 100,
  });
  expect(stampsSent()).toEqual([
    { currentSeconds: 10, watchedSeconds: 10 },
    { currentSeconds: 20, watchedSeconds: 20 },
    { currentSeconds: 25, watchedSeconds: 25 },
  ]);
  const puts = upstream.sent.filter((call) => call.method === "PUT");
  expect(puts.map((call) => call.path)).toEqual([
    `${LMS}/course/c-2/lesson/l-1/video-stamp`,
    `${LMS}/course/c-2/lesson/l-1/video-stamp`,
    `${LMS}/course/c-2/lesson/l-1/video-stamp`,
    `${LMS}/course/c-2/lesson/l-1/lesson-completed`,
  ]);
  expect(upstream.calls).toContain(`${LMS}/course/c-2/enrollment`);
  expect(upstream.calls).not.toContain(`${LMS}/course/done-1/lesson`);
  const completion = upstream.sent.find((call) =>
    call.path.endsWith("/lesson-completed")
  );
  expect(JSON.parse(completion?.body ?? "{}")).toEqual({ watchedSeconds: 25 });
  const done = doneOf(events);
  expect(done.earned).toBe(VIDEO_EXP);
  expect(done.lessons).toBe(1);
  expect(done.reached).toBe(false);
  expect(done.reason).toContain("no more video lessons");
});

test("shows the video part of the content when a lesson starts", async () => {
  upstream = lmsUpstream({
    content: {
      videoContent: { hls: "https://cdn.test/v.m3u8", lastSecond: 3 },
    },
    lessons: [
      {
        durationInSeconds: 25,
        enrollmentId: "e-1",
        lessonType: "video",
        lessonVersionId: "l-1",
      },
    ],
  });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const started = events.find(
    (event) => event.event === "lesson" && event.status === "started"
  );
  expect(started?.event === "lesson" && started.content).toEqual({
    hls: "https://cdn.test/v.m3u8",
    lastSecond: 3,
  });
});

test("sends the LMS headers the web client sends", async () => {
  upstream = lmsUpstream();
  await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const open = upstream.sent.find(
    (call) => call.path === `${LMS}/course/c-2/lesson/l-1`
  );
  expect(open?.method).toBe("POST");
  expect(JSON.parse(open?.body ?? "{}")).toEqual({ enrollmentId: "e-9" });
});

test("leaves the course open while a non-video lesson is still pending", async () => {
  upstream = lmsUpstream();
  await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(
    upstream.calls.some((path) => path.endsWith("/course-completed"))
  ).toBe(false);
});

test("closes the course when its last open lesson was the video just watched", async () => {
  upstream = lmsUpstream({
    lessons: [
      { enrollmentId: "e-1", lessonType: "video", lessonVersionId: "l-1" },
    ],
  });
  await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(upstream.calls).toContain(
    `${LMS}/course/c-2/lesson/l-1/course-completed`
  );
  expect(upstream.calls).not.toContain(`${LMS}/course/c-2/enrollment`);
});

test("stops once the target is earned", async () => {
  upstream = lmsUpstream();
  const done = doneOf(
    await collect({ cookie: COOKIE, sleep: NO_SLEEP, target: VIDEO_EXP })
  );
  expect(done.reached).toBe(true);
  expect(done.reason).toBe("target reached");
});

test("reports the month's EXP before and after", async () => {
  upstream = lmsUpstream();
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const monthly = events.flatMap((event) =>
    event.event === "exp" ? [event.monthly] : []
  );
  expect(monthly).toEqual([MONTHLY, MONTHLY]);
});

test("falls back to the tier's per-lesson EXP when completion reports none", async () => {
  upstream = lmsUpstream({ completion: { ok: true } });
  const done = doneOf(await collect({ cookie: COOKIE, sleep: NO_SLEEP }));
  expect(done.earned).toBe(VIDEO_EXP);
});

test("a dry run lists the plan and sends nothing that changes the account", async () => {
  upstream = lmsUpstream();
  const events = await collect({
    cookie: COOKIE,
    dryRun: true,
    sleep: NO_SLEEP,
  });
  const planned = events.filter(
    (event) => event.event === "lesson" && event.status === "planned"
  );
  expect(planned).toHaveLength(1);
  const writes = upstream.sent.filter(
    (call) => call.method === "PUT" || call.path.endsWith("/enrollment")
  );
  expect(writes).toHaveLength(0);
  expect(upstream.calls).not.toContain(`${LMS}/course/c-2/lesson/l-1`);
  expect(doneOf(events).earned).toBe(VIDEO_EXP);
});

test("skips a lesson whose content carries no duration", async () => {
  upstream = lmsUpstream({
    content: { title: "no video here" },
    lessons: [{ lessonType: "video", lessonVersionId: "l-1" }],
  });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const skipped = events.find(
    (event) => event.event === "lesson" && event.status === "skipped"
  );
  expect(skipped).toBeDefined();
  expect(stampsSent()).toHaveLength(0);
});

test("stops the run when the LMS refuses the session", async () => {
  upstream = lmsUpstream({ refuse: "/session/session-exp" });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const error = errorOf(events);
  expect(error.status).toBe(401);
  expect(error.message).toContain("stale");
  expect(doneOf(events).reason).toContain("refused the session");
  expect(upstream.calls).not.toContain(`${LMS}/course/v2`);
});

test("stops at the first failed stamp rather than trying every course", async () => {
  upstream = lmsUpstream({ refuse: "/course/c-2/lesson/l-1/video-stamp" });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const error = errorOf(events);
  expect(error.fatal).toBe(true);
  expect(error.detail).toContain("INVALID_CREDENTIAL");
  expect(doneOf(events).reached).toBe(false);
});

test("skips a course whose lessons the LMS will not list", async () => {
  upstream = lmsUpstream({
    courses: [
      { code: "c-2", learnerStatus: "IN_PROGRESS" },
      { code: "c-3", learnerStatus: "IN_PROGRESS" },
    ],
    refuse: "/course/c-3/lesson",
  });
  await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(stampsSent()).toHaveLength(3);
});

test("sleeps for the gap between stamps divided by the pace", async () => {
  upstream = lmsUpstream();
  const waits: number[] = [];
  await collect({
    cookie: COOKIE,
    pace: 5,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  expect(waits).toEqual([2000, 2000, 1000]);
});

test("stops when the caller goes away", async () => {
  upstream = lmsUpstream();
  const controller = new AbortController();
  const events = await collect({
    cookie: COOKIE,
    signal: controller.signal,
    sleep: () => {
      controller.abort();
      return Promise.resolve();
    },
  });
  expect(stampsSent()).toHaveLength(0);
  expect(doneOf(events).reason).toContain("caller went away");
});

test("plans stamps on the interval and always ends on the duration", () => {
  expect(planStamps(25, 10)).toEqual([10, 20, 25]);
  expect(planStamps(30, 10)).toEqual([10, 20, 30]);
  expect(planStamps(4, 10)).toEqual([4]);
});

test("stamps the playhead and the watched time under the names the LMS uses", () => {
  expect(stampBody(15)).toEqual({ currentSeconds: 15, watchedSeconds: 15 });
});

test("reads completion from the ways the LMS marks it", () => {
  expect(isDone(asLesson({ learnerStatus: "COMPLETED" }))).toBe(true);
  expect(isDone(asLesson({ learnerStatus: { status: "completed" } }))).toBe(
    true
  );
  expect(isDone(asLesson({ isCompleted: true }))).toBe(true);
  expect(isDone(asLesson({ progress: 100 }))).toBe(true);
  expect(isDone(asLesson({ progress: "100" }))).toBe(true);
  expect(isDone(asLesson({ progress: { percent: 100 } }))).toBe(true);
  expect(isDone(asLesson({ learnerStatus: "IN_PROGRESS", progress: 40 }))).toBe(
    false
  );
  expect(isDone(asLesson({ progress: "half" }))).toBe(false);
  expect(isDone(asLesson({}))).toBe(false);
});

test("takes the course code, or the id without its prefix", () => {
  expect(courseCode(asCourse({ code: "abc", id: "course-abc" }))).toBe("abc");
  expect(courseCode(asCourse({ id: "course-xyz" }))).toBe("xyz");
  expect(courseCode(asCourse({ id: 7 }))).toBe("7");
  expect(courseCode(asCourse({}))).toBeUndefined();
});

test("finds a duration in the content before the lesson listing", () => {
  expect(
    durationOf({ video: { duration: 90 } }, asLesson({ durationInSeconds: 5 }))
  ).toBe(90);
  expect(durationOf({}, asLesson({ durationInSeconds: 5 }))).toBe(5);
  expect(durationOf({}, asLesson({}))).toBeUndefined();
});

test("reads an enrolment id from the shapes an enrolment can answer with", () => {
  expect(enrollmentIdSchema.parse({ enrollmentId: "e-1" })).toBe("e-1");
  expect(enrollmentIdSchema.parse({ id: 3 })).toBe("3");
  expect(enrollmentIdSchema.parse({ enrollment: { id: "e-2" } })).toBe("e-2");
  expect(enrollmentIdSchema.parse("e-3")).toBe("e-3");
  expect(enrollmentIdSchema.parse(null)).toBeUndefined();
});

test("reads the month's EXP only from a key that names the month", () => {
  expect(monthlyExpOf({ member: { expEarn: "25" }, user: {} })).toBe(25);
  expect(monthlyExpOf({ monthlyExp: 0 })).toBe(0);
  expect(monthlyExpOf({ summary: { currentMonthExp: 55 } })).toBe(55);
  expect(monthlyExpOf({ exp: 500 })).toBeUndefined();
});

test("does not descend into arrays or past the search depth", () => {
  expect(findNumber({ items: [{ exp: 5 }] }, ["exp"])).toBeUndefined();
  expect(
    findNumber({ a: { b: { c: { d: { exp: 5 } } } } }, ["exp"])
  ).toBeUndefined();
  expect(findNumber({ a: { b: { exp: "5" } } }, ["exp"])).toBe(5);
});
