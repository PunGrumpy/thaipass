import { afterEach, expect, test } from "bun:test";

import { sseResponse, stubUpstream } from "@thaipass/core/testing/upstream";
import type { Upstream } from "@thaipass/core/testing/upstream";
import { z } from "zod";

import {
  courseSchema,
  enrollmentIdSchema,
  lessonContentSchema,
  lessonSchema,
} from "./api";
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
const MONTHLY = 25;
const DURATION = 25;
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
  /** The period's EXP before the run. */
  readonly monthly?: number;
  readonly courses?: readonly Payload[];
  readonly lessons?: readonly Payload[];
  readonly content?: Payload;
  /** What the LMS says after the stamp that reaches the end. */
  readonly endStatus?: string;
  /** Whether the period's EXP moves when a lesson completes. */
  readonly expMoves?: boolean;
  readonly refuse?: string;
}

const asLesson = (value: Payload) => lessonSchema.parse(value);
const asCourse = (value: Payload) => courseSchema.parse(value);
const asContent = (value: Payload) => lessonContentSchema.parse(value);

const DEFAULT_COURSES = [
  { code: "done-1", learnerStatus: "COMPLETED", title: "Old" },
  { code: "c-2", learnerStatus: "IN_PROGRESS", title: "New" },
];

/** As the live listing answers: uppercase types, a rounded duration, its own status field. */
const DEFAULT_LESSONS = [
  {
    durationSeconds: 30,
    learnerLessonStatus: "IN_PROGRESS",
    lessonType: "VIDEO",
    lessonVersionId: "l-1",
    title: "Intro",
  },
  { lessonType: "ARTICLE", lessonVersionId: "l-2", title: "Read" },
];

/** As opening a live lesson answers. */
const DEFAULT_CONTENT = {
  durationSeconds: DURATION,
  lessonProgressId: "p-1",
  lessonProgressStatus: "IN_PROGRESS",
  lessonType: "VIDEO",
  lessonVersionId: "l-1",
  videoContent: {
    durationSeconds: DURATION,
    videoContentId: "vc-1",
    videoHlsMasterPlaylistUrl: "https://cdn.test/v.m3u8",
    watchedSeconds: 0,
  },
};

const stampSchema = z.object({
  durationSeconds: z.number(),
  enrollmentId: z.string(),
  lessonProgressId: z.string().nullable(),
  videoContentId: z.string(),
  watchedSeconds: z.number(),
});

interface Progress {
  completed: boolean;
}

/** Answers a stamp the way the LMS does: in progress until the end, then whatever the fixture says. */
const stampReply = (fixture: Fixture, progress: Progress): Response => {
  const sent = upstream.sent.at(-1);
  const stamp = stampSchema.parse(JSON.parse(sent?.body ?? "{}"));
  const atEnd = stamp.watchedSeconds >= stamp.durationSeconds;
  const status = atEnd ? (fixture.endStatus ?? "COMPLETED") : "IN_PROGRESS";
  progress.completed ||= status === "COMPLETED";
  return ok({ lessonProgressId: "p-1", status });
};

const expReply = (fixture: Fixture, progress: Progress): Response => {
  const paid = progress.completed && (fixture.expMoves ?? true);
  const monthly = fixture.monthly ?? MONTHLY;
  return ok({
    member: { expEarn: String(monthly + (paid ? VIDEO_EXP : 0)) },
    user: { name: "Grumpy" },
  });
};

/** The LMS as the lesson page sees it: one course with one video and one article. */
const lmsUpstream = (fixture: Fixture = {}): Upstream => {
  const progress: Progress = { completed: false };
  return stubUpstream(sseResponse([]), (path) => {
    if (!path.startsWith(LMS)) {
      return;
    }
    const route = path.slice(LMS.length);
    if (fixture.refuse && route.startsWith(fixture.refuse)) {
      return refused();
    }
    if (route === "/session/session-exp") {
      return expReply(fixture, progress);
    }
    if (route === "/session/session-tier") {
      return ok({
        member: { lessonTypeExp: [{ exp: VIDEO_EXP, lessonType: "VIDEO" }] },
      });
    }
    if (route === "/course/v2") {
      const pages = upstream.sent.filter((call) => call.path === path).length;
      const courses = pages <= 1 ? (fixture.courses ?? DEFAULT_COURSES) : [];
      return ok({ courses, limit: 20, page: pages, total: courses.length });
    }
    if (route === "/course/c-2/lesson") {
      return ok({
        enrollmentId: "",
        lessons: fixture.lessons ?? DEFAULT_LESSONS,
      });
    }
    if (route === "/course/c-2/enrollment") {
      return ok({ enrollmentId: "e-9" });
    }
    if (route === "/course/c-2/lesson/l-1") {
      return ok(fixture.content ?? DEFAULT_CONTENT);
    }
    if (route.endsWith("/video-stamp")) {
      return stampReply(fixture, progress);
    }
    return ok({});
  });
};

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

const lessonWith = (events: readonly LearnEvent[], status: string) => {
  const found = events.find(
    (event) => event.event === "lesson" && event.status === status
  );
  return found?.event === "lesson" ? found : undefined;
};

const stampsSent = () =>
  upstream.sent
    .filter((call) => call.path.endsWith("/video-stamp"))
    .map((call) => stampSchema.parse(JSON.parse(call.body)));

const bodyOf = (suffix: string): Payload | undefined => {
  const call = upstream.sent.find((entry) => entry.path.endsWith(suffix));
  return call ? JSON.parse(call.body) : undefined;
};

test("stamps what the player stamps, every ten seconds up to the end", async () => {
  upstream = lmsUpstream();
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const stamp = (watchedSeconds: number) => ({
    durationSeconds: DURATION,
    enrollmentId: "e-9",
    lessonProgressId: "p-1",
    videoContentId: "vc-1",
    watchedSeconds,
  });
  expect(stampsSent()).toEqual([stamp(10), stamp(20), stamp(25)]);
  expect(upstream.calls).toContain(`${LMS}/course/c-2/enrollment`);
  expect(upstream.calls).not.toContain(`${LMS}/course/done-1/lesson`);
  expect(
    upstream.calls.some((path) => path.endsWith("/lesson-completed"))
  ).toBe(false);
  const done = doneOf(events);
  expect(done.earned).toBe(VIDEO_EXP);
  expect(done.lessons).toBe(1);
  expect(done.reason).toContain("no more video lessons");
});

test("opens the lesson with the enrolment id, as the page does", async () => {
  upstream = lmsUpstream();
  await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const open = upstream.sent.find(
    (call) => call.path === `${LMS}/course/c-2/lesson/l-1`
  );
  expect(open?.method).toBe("POST");
  expect(JSON.parse(open?.body ?? "{}")).toEqual({ enrollmentId: "e-9" });
});

test("asks the course to close once a stamp reports the lesson complete", async () => {
  upstream = lmsUpstream();
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(bodyOf("/course-completed")).toEqual({ enrollmentId: "e-9" });
  expect(events.some((event) => event.event === "course_completed")).toBe(true);
});

test("treats a lesson the LMS leaves in progress as not completed", async () => {
  upstream = lmsUpstream({ endStatus: "IN_PROGRESS" });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(bodyOf("/course-completed")).toBeUndefined();
  expect(lessonWith(events, "skipped")?.reason).toContain("IN_PROGRESS");
  expect(doneOf(events).lessons).toBe(0);
});

test("prices a lesson by how much the period's EXP moved", async () => {
  upstream = lmsUpstream();
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(lessonWith(events, "completed")?.exp).toBe(VIDEO_EXP);
  const monthly = events.flatMap((event) =>
    event.event === "exp" ? [event.monthly] : []
  );
  expect(monthly).toEqual([MONTHLY, MONTHLY + VIDEO_EXP]);
});

test("counts nothing for a lesson the LMS did not pay for", async () => {
  upstream = lmsUpstream({ expMoves: false });
  const done = doneOf(await collect({ cookie: COOKIE, sleep: NO_SLEEP }));
  expect(done.earned).toBe(0);
  expect(done.lessons).toBe(1);
});

test("resumes from the seconds already watched", async () => {
  upstream = lmsUpstream({
    content: {
      ...DEFAULT_CONTENT,
      videoContent: { ...DEFAULT_CONTENT.videoContent, watchedSeconds: 12 },
    },
  });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(stampsSent().map((stamp) => stamp.watchedSeconds)).toEqual([22, 25]);
  expect(lessonWith(events, "started")?.watched).toBe(12);
});

test("skips a lesson the content already marks complete", async () => {
  upstream = lmsUpstream({
    content: { ...DEFAULT_CONTENT, lessonProgressStatus: "COMPLETED" },
  });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(stampsSent()).toHaveLength(0);
  expect(lessonWith(events, "skipped")?.reason).toContain("already");
});

test("keeps the enrolment id the listing already carries", async () => {
  upstream = lmsUpstream({
    lessons: [
      { enrollmentId: "e-1", lessonType: "VIDEO", lessonVersionId: "l-1" },
    ],
  });
  await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(upstream.calls).not.toContain(`${LMS}/course/c-2/enrollment`);
  expect(stampsSent()[0]?.enrollmentId).toBe("e-1");
});

test("stops once the period's EXP reaches the target", async () => {
  upstream = lmsUpstream();
  const done = doneOf(
    await collect({
      cookie: COOKIE,
      sleep: NO_SLEEP,
      target: MONTHLY + VIDEO_EXP,
    })
  );
  expect(done.reached).toBe(true);
  expect(done.monthly).toBe(MONTHLY + VIDEO_EXP);
  expect(done.reason).toBe("target reached");
});

test("touches nothing when the period already has the target", async () => {
  upstream = lmsUpstream({ monthly: 325 });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  const done = doneOf(events);
  expect(done.reached).toBe(true);
  expect(done.reason).toContain("already");
  expect(upstream.calls).not.toContain(`${LMS}/course/v2`);
  expect(events).toHaveLength(2);
});

test("earn asks for more in this run whatever the period already has", async () => {
  upstream = lmsUpstream({ monthly: 325 });
  const events = await collect({
    cookie: COOKIE,
    earn: VIDEO_EXP,
    sleep: NO_SLEEP,
  });
  const done = doneOf(events);
  expect(done.lessons).toBe(1);
  expect(done.earned).toBe(VIDEO_EXP);
  expect(done.reached).toBe(true);
  expect(done.target).toBe(VIDEO_EXP);
  expect(done.reason).toBe("earned what was asked");
  expect(lessonWith(events, "completed")?.monthly).toBe(325 + VIDEO_EXP);
});

test("falls back to this run's earnings when the LMS reports no figure", async () => {
  upstream = lmsUpstream({ monthly: Number.NaN });
  const done = doneOf(
    await collect({ cookie: COOKIE, sleep: NO_SLEEP, target: VIDEO_EXP })
  );
  expect(done.monthly).toBeNull();
  expect(done.earned).toBe(VIDEO_EXP);
  expect(done.reached).toBe(true);
});

test("a dry run lists the plan and sends nothing that changes the account", async () => {
  upstream = lmsUpstream();
  const events = await collect({
    cookie: COOKIE,
    dryRun: true,
    sleep: NO_SLEEP,
  });
  expect(lessonWith(events, "planned")?.duration).toBe(30);
  const writes = upstream.sent.filter(
    (call) => call.method === "PUT" || call.path.endsWith("/enrollment")
  );
  expect(writes).toHaveLength(0);
  expect(upstream.calls).not.toContain(`${LMS}/course/c-2/lesson/l-1`);
  expect(doneOf(events).earned).toBe(VIDEO_EXP);
});

test("skips a lesson whose content carries no video", async () => {
  upstream = lmsUpstream({ content: { title: "no video here" } });
  const events = await collect({ cookie: COOKIE, sleep: NO_SLEEP });
  expect(lessonWith(events, "skipped")).toBeDefined();
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

test("pauses before a stamp would overrun the time budget, and says so", async () => {
  upstream = lmsUpstream();
  let clock = 0;
  const events = await collect({
    budgetMs: 25_000,
    cookie: COOKIE,
    now: () => clock,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
  });
  expect(stampsSent().map((stamp) => stamp.watchedSeconds)).toEqual([10, 20]);
  expect(lessonWith(events, "paused")?.reason).toContain("time budget");
  expect(bodyOf("/course-completed")).toBeUndefined();
  const done = doneOf(events);
  expect(done.paused).toBe(true);
  expect(done.reached).toBe(false);
  expect(done.reason).toBe("time budget spent");
  expect(done.lessons).toBe(0);
});

test("finishes within the budget when the lesson fits", async () => {
  upstream = lmsUpstream();
  let clock = 0;
  const events = await collect({
    budgetMs: 60_000,
    cookie: COOKIE,
    now: () => clock,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
  });
  expect(doneOf(events).paused).toBe(false);
  expect(doneOf(events).lessons).toBe(1);
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

test("plans stamps on the interval past what is watched, ending on the duration", () => {
  expect(planStamps(25, 10)).toEqual([10, 20, 25]);
  expect(planStamps(30, 10)).toEqual([10, 20, 30]);
  expect(planStamps(4, 10)).toEqual([4]);
  expect(planStamps(25, 10, 12)).toEqual([22, 25]);
  expect(planStamps(25, 10, 25)).toEqual([]);
});

test("builds the stamp from the content, whole seconds only", () => {
  expect(stampBody(asContent(DEFAULT_CONTENT), "e-9", 12.9, 281.36)).toEqual({
    durationSeconds: 281,
    enrollmentId: "e-9",
    lessonProgressId: "p-1",
    videoContentId: "vc-1",
    watchedSeconds: 12,
  });
  expect(stampBody(asContent({}), "e-9", 5, 9).lessonProgressId).toBeNull();
  expect(stampBody(asContent({}), "e-9", 5, 9, "p-2").lessonProgressId).toBe(
    "p-2"
  );
});

test("reads completion from the ways the LMS marks it", () => {
  expect(isDone(asLesson({ learnerStatus: "COMPLETED" }))).toBe(true);
  expect(isDone(asLesson({ learnerLessonStatus: "COMPLETED" }))).toBe(true);
  expect(isDone(asLesson({ lessonProgressStatus: "completed" }))).toBe(true);
  expect(isDone(asLesson({ learnerStatus: { status: "completed" } }))).toBe(
    true
  );
  expect(isDone(asLesson({ isCompleted: true }))).toBe(true);
  expect(isDone(asLesson({ progress: 100 }))).toBe(true);
  expect(isDone(asLesson({ progress: "100" }))).toBe(true);
  expect(isDone(asLesson({ progress: { percent: 100 } }))).toBe(true);
  expect(isDone(asLesson({ learnerLessonStatus: "IN_PROGRESS" }))).toBe(false);
  expect(isDone(asLesson({ progress: "half" }))).toBe(false);
  expect(isDone(asLesson({}))).toBe(false);
});

test("takes the course code, or the id without its prefix", () => {
  expect(courseCode(asCourse({ code: "abc", id: "course-abc" }))).toBe("abc");
  expect(courseCode(asCourse({ id: "course-xyz" }))).toBe("xyz");
  expect(courseCode(asCourse({ id: 7 }))).toBe("7");
  expect(courseCode(asCourse({}))).toBeUndefined();
});

test("takes the video's own duration before the listing's rounded one", () => {
  const lesson = asLesson({ durationSeconds: 300 });
  expect(durationOf(asContent(DEFAULT_CONTENT), lesson)).toBe(DURATION);
  expect(durationOf(asContent({ durationSeconds: 90 }), lesson)).toBe(90);
  expect(durationOf(asContent({}), lesson)).toBe(300);
  expect(durationOf(asContent({}), asLesson({ durationInSeconds: 5 }))).toBe(5);
  expect(durationOf(asContent({}), asLesson({}))).toBeUndefined();
});

test("reads an enrolment id from the shapes an enrolment can answer with", () => {
  expect(enrollmentIdSchema.parse({ enrollmentId: "e-1" })).toBe("e-1");
  expect(enrollmentIdSchema.parse({ id: 3 })).toBe("3");
  expect(enrollmentIdSchema.parse({ enrollment: { id: "e-2" } })).toBe("e-2");
  expect(enrollmentIdSchema.parse("e-3")).toBe("e-3");
  expect(enrollmentIdSchema.parse(null)).toBeUndefined();
});

test("reads the period's EXP from the key a live session carries", () => {
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
