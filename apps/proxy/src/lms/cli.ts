#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { cookieFromValue } from "@thaipass/core/aipass/session";

import { env } from "../lib/env";
import "../lib/settings";
import { DEFAULT_TARGET, learn } from "./learn";
import type { LearnEvent } from "./learn";

/**
 * Runs the learner in-process, on the machine, with no function limit to
 * work around and no loop to write: one command, until the period has the
 * target or the videos run out.
 */

const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;
const MAX_PACE = 16;
const EXIT_OK = 0;
const EXIT_NOT_REACHED = 1;
const EXIT_USAGE = 2;
const CLEAR_LINE = "\r\u001B[2K";

export const USAGE = `Usage: bun run lms [options]

Watches video lessons in the AI Pass LMS until the period's EXP reaches the
target, or until this run has earned what --earn asks for. Reads the session
cookie from AIPASS_COOKIE, or from --cookie-file.

Options:
  -t, --target <exp>        The period's EXP to reach (default ${DEFAULT_TARGET});
                            a period that already has it means nothing to do
  -e, --earn <exp>          Earn this much in this run, whatever the period has
  -p, --pace <speed>        Playback speed, 1 is real time (default 1, max ${MAX_PACE})
  -m, --max-lessons <n>     Stop after this many lessons (default 50)
  -c, --cookie-file <path>  Read the Cookie header from a file instead of the environment
      --dry-run             List what would be learned and change nothing
      --json                One JSON object per line, as the proxy streams it
  -h, --help                Show this message

Exit status: 0 when the goal is there, 1 when it is not, 2 on a usage error.`;

export interface CliOptions {
  readonly cookieFile: string | undefined;
  readonly dryRun: boolean;
  readonly earn: number | undefined;
  readonly help: boolean;
  readonly json: boolean;
  readonly maxLessons: number | undefined;
  readonly pace: number | undefined;
  readonly target: number | undefined;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const positiveNumber = (
  flag: string,
  raw: string | undefined
): number | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new UsageError(`--${flag} wants a positive number, got "${raw}"`);
  }
  return value;
};

const spec = {
  allowPositionals: false,
  options: {
    "cookie-file": { short: "c", type: "string" },
    "dry-run": { type: "boolean" },
    earn: { short: "e", type: "string" },
    help: { short: "h", type: "boolean" },
    json: { type: "boolean" },
    "max-lessons": { short: "m", type: "string" },
    pace: { short: "p", type: "string" },
    target: { short: "t", type: "string" },
  },
} as const;

export const parseCliArgs = (args: readonly string[]): CliOptions => {
  let values: ReturnType<typeof parseArgs<typeof spec>>["values"];
  try {
    ({ values } = parseArgs({ ...spec, args: [...args] }));
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error)
    );
  }
  const pace = positiveNumber("pace", values.pace);
  if (pace !== undefined && pace > MAX_PACE) {
    throw new UsageError(`--pace goes up to ${MAX_PACE}`);
  }
  return {
    cookieFile: values["cookie-file"],
    dryRun: values["dry-run"] ?? false,
    earn: positiveNumber("earn", values.earn),
    help: values.help ?? false,
    json: values.json ?? false,
    maxLessons: positiveNumber("max-lessons", values["max-lessons"]),
    pace,
    target: positiveNumber("target", values.target),
  };
};

/** The cookie from the file when one is named, else from the environment. */
export const resolveCookie = async (
  cookieFile?: string,
  fromEnv?: string
): Promise<string> => {
  const raw =
    cookieFile === undefined ? fromEnv : await readFile(cookieFile, "utf-8");
  if (!raw?.trim()) {
    throw new UsageError(
      "no cookie: set AIPASS_COOKIE to the Cookie header of a browser signed in to AI Pass, or pass --cookie-file"
    );
  }
  const lookup = cookieFromValue(raw);
  if (!lookup.ok) {
    throw new UsageError(lookup.reason);
  }
  return lookup.cookie;
};

const clock = (seconds: number): string => {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  const rest = whole % SECONDS_PER_MINUTE;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export interface Line {
  readonly text: string;
  /** Redrawn in place on a terminal: progress rather than history. */
  readonly transient?: boolean;
  readonly stderr?: boolean;
}

type LessonEvent = Extract<LearnEvent, { event: "lesson" }>;

const describeLesson = (event: LessonEvent): Line | undefined => {
  const title = event.title ?? event.lesson;
  const length = event.duration ? ` (${clock(event.duration)})` : "";
  switch (event.status) {
    case "planned": {
      return {
        text: `  · ${title}${length} — would watch, about ${event.exp ?? "?"} EXP`,
      };
    }
    case "started": {
      const resume = event.watched
        ? `, resuming from ${clock(event.watched)}`
        : "";
      return { text: `  ▶ ${title}${length}${resume}` };
    }
    case "completed": {
      const period =
        event.monthly === undefined || event.monthly === null
          ? ""
          : ` (period ${event.monthly})`;
      return { text: `  ✓ ${title} — +${event.exp ?? 0} EXP${period}` };
    }
    case "skipped":
    case "paused": {
      return { text: `  – ${title}: ${event.reason ?? event.status}` };
    }
    default: {
      return undefined;
    }
  }
};

/** One human-readable line per event, or none for events that only repeat what a later line says. */
export const describe = (event: LearnEvent): Line | undefined => {
  switch (event.event) {
    case "exp": {
      return event.phase === "before"
        ? { text: `EXP this period: ${event.monthly ?? "unknown"}` }
        : undefined;
    }
    case "course": {
      return {
        text: `course ${event.code} · ${event.title ?? "untitled"} — ${plural(event.videos, "video")}`,
      };
    }
    case "lesson": {
      return describeLesson(event);
    }
    case "stamp": {
      const percent = Math.floor((event.at / event.duration) * PERCENT);
      const status = event.status ? `  ${event.status}` : "";
      return {
        text: `    ${clock(event.at)} / ${clock(event.duration)}  ${percent}%${status}`,
        transient: true,
      };
    }
    case "course_completed": {
      return { text: "  course closed" };
    }
    case "error": {
      return {
        stderr: true,
        text: `✗ ${event.message}${event.detail ? `\n  ${event.detail}` : ""}`,
      };
    }
    case "done": {
      return {
        text: `done: +${event.earned} EXP in ${plural(event.lessons, "lesson")} · period ${event.monthly ?? "unknown"} · ${event.reason}`,
      };
    }
    default: {
      return undefined;
    }
  }
};

interface Output {
  readonly write: (line: Line) => void;
  readonly finish: () => void;
}

/** A terminal gets progress redrawn in place; a pipe gets every line once. */
const output = (isTty: boolean): Output => {
  let pending = false;
  const clear = (): void => {
    if (pending) {
      process.stdout.write(CLEAR_LINE);
      pending = false;
    }
  };
  return {
    finish: clear,
    write: (line) => {
      if (line.transient) {
        if (isTty) {
          process.stdout.write(`${CLEAR_LINE}${line.text}`);
          pending = true;
        }
        return;
      }
      clear();
      const stream = line.stderr ? process.stderr : process.stdout;
      stream.write(`${line.text}\n`);
    },
  };
};

export const run = async (args: readonly string[]): Promise<number> => {
  const options = parseCliArgs(args);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_OK;
  }
  const cookie = await resolveCookie(options.cookieFile, env.AIPASS_COOKIE);
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const out = output(process.stdout.isTTY === true);
  let reached = false;
  try {
    for await (const event of learn({
      cookie,
      dryRun: options.dryRun,
      earn: options.earn,
      maxLessons: options.maxLessons,
      pace: options.pace,
      signal: controller.signal,
      target: options.target,
    })) {
      if (options.json) {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      } else {
        const line = describe(event);
        if (line) {
          out.write(line);
        }
      }
      if (event.event === "done") {
        ({ reached } = event);
      }
    }
  } finally {
    out.finish();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  return reached ? EXIT_OK : EXIT_NOT_REACHED;
};

const main = async (): Promise<void> => {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n\n${USAGE}\n`);
      process.exitCode = EXIT_USAGE;
      return;
    }
    throw error;
  }
};

if (import.meta.main) {
  await main();
}
