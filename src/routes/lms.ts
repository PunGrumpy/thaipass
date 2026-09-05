import { Elysia, status } from "elysia";
import { z } from "zod";

import { clientIdFromCookie, cookieFromRequest } from "../aipass/session";
import { env } from "../lib/env";
import { requestLogger } from "../lib/logger";
import type { DeferredEmit } from "../lib/logger";
import { json } from "../lib/openapi";
import { guardController } from "../lib/stream";
import { readAchievement, readSessionExp, readSessionTier } from "../lms/api";
import { DEFAULT_TARGET, learn, monthlyExpOf } from "../lms/learn";
import type { LearnEvent } from "../lms/learn";
import { LmsError } from "../lms/request";
import { apiError, apiErrorSchema } from "../openai/errors";

const MAX_PACE = 16;
const MAX_LESSONS = 200;
const MIN_BUDGET_S = 30;
const MAX_BUDGET_S = 3600;
/** Under Vercel's 300 s function limit, with room for the reads around the last stamp. */
const VERCEL_BUDGET_S = 270;
const MS_PER_S = 1000;
const CLIENT_CLOSED_STATUS = 499;
const BAD_GATEWAY = 502;

export const learnRequestSchema = z.object({
  budget_seconds: z
    .number()
    .int()
    .min(MIN_BUDGET_S)
    .max(MAX_BUDGET_S)
    .optional(),
  dry_run: z.boolean().optional(),
  max_lessons: z.number().int().min(1).max(MAX_LESSONS).optional(),
  pace: z.number().min(1).max(MAX_PACE).optional(),
  target: z.number().int().min(1).optional(),
});

export const lmsExpSchema = z.object({
  achievement: z.unknown(),
  monthly: z.number().nullable(),
  session_exp: z.unknown(),
  session_tier: z.unknown(),
});

export type LearnRequest = z.infer<typeof learnRequestSchema>;
export type LmsExp = z.infer<typeof lmsExpSchema>;

const ndjson = (description: string, lines: string) => ({
  content: {
    "application/x-ndjson": { schema: { description: lines, type: "string" } },
  },
  description,
});

const settled = async <T>(read: Promise<T>): Promise<T | null> => {
  try {
    return await read;
  } catch {
    return null;
  }
};

const encoder = new TextEncoder();

export const lmsRoutes = new Elysia()
  .use(requestLogger)
  .model({
    ApiError: apiErrorSchema,
    LearnRequest: learnRequestSchema,
    LmsExp: lmsExpSchema,
  })
  .get(
    "/v1/lms/exp",
    {
      detail: {
        description:
          "The account's learning EXP as the LMS reports it: the session-exp payload as is, the session tier, and the achievement summary. monthly is the month's figure when the payload names one, else null. Reads only.",
        responses: {
          "200": json("LmsExp", "The account's EXP"),
          "401": json("ApiError", "Missing or malformed session cookie"),
          "502": json("ApiError", "The LMS refused the cookie"),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "Read the learning EXP",
        tags: ["LMS"],
      },
      response: { 200: "LmsExp", 401: "ApiError", 502: "ApiError" },
    },
    async ({ request, log }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, apiError(lookup.reason));
      }
      const { cookie } = lookup;
      log.set({ clientId: clientIdFromCookie(cookie) });
      try {
        const [sessionExp, sessionTier, achievement] = await Promise.all([
          readSessionExp(cookie, request.signal),
          settled(readSessionTier(cookie, request.signal)),
          settled(readAchievement(cookie, request.signal)),
        ]);
        const monthly = monthlyExpOf(sessionExp) ?? null;
        log.set({ lmsMonthlyExp: monthly ?? undefined });
        return {
          achievement,
          monthly,
          session_exp: sessionExp,
          session_tier: sessionTier,
        };
      } catch (error) {
        const message =
          error instanceof LmsError ? error.message : String(error);
        log.set({
          status: BAD_GATEWAY,
          upstreamStatus: error instanceof LmsError ? error.status : undefined,
        });
        return status(BAD_GATEWAY, apiError(message));
      }
    }
  )
  .post(
    "/v1/lms/learn",
    {
      body: "LearnRequest",
      detail: {
        description:
          "Learns video lessons in the LMS until the period's EXP reaches the target, 100 by default; a run whose period already has it ends after one read. The proxy enrols in each course that still has an unwatched video, opens the lesson, and stamps the seconds watched every ten seconds, which is what the lesson page sends; a stamp the LMS answers with COMPLETED is what earns the EXP. pace is the playback speed: 1 stamps in real time, so a ten minute video takes ten minutes. The reply streams one JSON object per line as the run goes, ending with a done line, so it holds the connection for as long as the videos take. budget_seconds ends the run cleanly before that much wall-clock has passed, with paused true on the done line, and the next call resumes from the last stamp; on Vercel it defaults to 270, under the function limit. dry_run lists what would be learned and sends nothing that changes the account.",
        responses: {
          "200": ndjson(
            "Progress, one JSON object per line",
            "Lines of exp, course, lesson, stamp, course_completed, error and done events, in that order of occurrence."
          ),
          "400": json("ApiError", "Malformed body"),
          "401": json("ApiError", "Missing or malformed session cookie"),
        },
        security: [{ aipassCookie: [] }, { aipassCookieKey: [] }],
        summary: "Earn EXP from video lessons",
        tags: ["LMS"],
      },
      parse: "json",
    },
    ({ body, request, log, deferEmit }) => {
      const lookup = cookieFromRequest(request);
      if (!lookup.ok) {
        log.set({ authReason: lookup.reason, status: 401 });
        return status(401, apiError(lookup.reason));
      }
      const { cookie } = lookup;
      const target = body.target ?? DEFAULT_TARGET;
      log.set({
        clientId: clientIdFromCookie(cookie),
        lmsDryRun: body.dry_run ?? false,
        lmsPace: body.pace ?? 1,
        lmsTarget: target,
      });
      const deferred: DeferredEmit = deferEmit;
      deferred.value = true;
      const budgetSeconds =
        body.budget_seconds ?? (env.VERCEL ? VERCEL_BUDGET_S : undefined);
      log.set({ lmsBudgetSeconds: budgetSeconds });
      const events = learn({
        budgetMs:
          budgetSeconds === undefined ? undefined : budgetSeconds * MS_PER_S,
        cookie,
        dryRun: body.dry_run,
        maxLessons: body.max_lessons,
        pace: body.pace,
        signal: request.signal,
        target,
      });
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const out = guardController(controller);
          const send = (event: LearnEvent): void => {
            out.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };
          try {
            for await (const event of events) {
              send(event);
              if (event.event === "done") {
                log.set({
                  lmsEarned: event.earned,
                  lmsLessons: event.lessons,
                  lmsMonthlyExp: event.monthly ?? undefined,
                  lmsPaused: event.paused,
                  lmsReached: event.reached,
                  lmsReason: event.reason,
                });
              } else if (event.event === "error") {
                log.set({ upstreamStatus: event.status });
                log.error(new Error(event.message));
              }
            }
          } catch (error) {
            log.error(
              error instanceof Error ? error : new Error(String(error))
            );
            send({
              code: null,
              detail: null,
              event: "error",
              fatal: true,
              message: String(error),
              scope: "session",
              status: 0,
            });
          } finally {
            log.set({
              clientAborted: !out.isOpen(),
              status: out.isOpen() ? 200 : CLIENT_CLOSED_STATUS,
            });
            log.emit();
            out.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "cache-control": "no-cache",
          "content-type": "application/x-ndjson; charset=utf-8",
        },
      });
    }
  );
