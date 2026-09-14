import { browserGetHeaders } from "@thaipass/core/aipass/request";
import { config } from "@thaipass/core/lib/config";
import { z } from "zod";

/**
 * The LMS at /lms is a separate Next.js app that talks to its own backend
 * through a same-origin proxy, so the chat session cookie carries here too.
 */
const LMS_API = "/lms/api/v1";
const LMS_REFERER = "/lms/my-courses";
const DETAIL_LENGTH = 400;
const REDIRECT_LOW = 300;
const REDIRECT_HIGH = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const BAD_GATEWAY = 502;

export type LmsMethod = "GET" | "POST" | "PUT" | "DELETE";

/** A field of an LMS body: an id, a figure, or the nested answers a quiz sends. */
export type LmsValue =
  | boolean
  | number
  | string
  | null
  | readonly LmsValue[]
  | { readonly [field: string]: LmsValue };

/** What the proxy sends the LMS: ids, paging, playback figures and quiz answers. */
export type LmsBody = Readonly<Record<string, LmsValue>>;

const isRedirect = (status: number): boolean =>
  status >= REDIRECT_LOW && status < REDIRECT_HIGH;

const STALE = "the LMS redirected to sign-in; cookie is stale, re-auth needed";

const explainUnauthorized = (path: string, message: string | undefined) =>
  `the LMS answered 401 on ${path}${message ? ` (${message})` : ""}; the cookie is stale, or was not copied from a browser that has opened /lms`;

/**
 * The LMS says this when the session signs in but carries no learner record in
 * the project the request resolves to, which reads as a missing course rather
 * than as the credential problem it is.
 */
const NO_LEARNER = /project learner/iu;

const explainNoLearner = (path: string, message: string) =>
  `the LMS answered 404 on ${path} (${message}); the session signs in but the LMS has no learner for it in the project this cookie names, so open ${LMS_REFERER} in the browser and copy the Cookie header from a request made on that page`;

/** What the refusal means, in words a caller can act on. */
const explain = (
  status: number,
  path: string,
  message: string | undefined
): string => {
  if (status === UNAUTHORIZED) {
    return explainUnauthorized(path, message);
  }
  if (
    status === NOT_FOUND &&
    message !== undefined &&
    NO_LEARNER.test(message)
  ) {
    return explainNoLearner(path, message);
  }
  return `the LMS answered ${status} on ${path}${message ? `: ${message}` : ""}`;
};

/** What the LMS backend answered, whether as an HTTP status or inside a 200 envelope. */
export class LmsError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly path: string;
  readonly detail: string | undefined;

  constructor(
    status: number,
    path: string,
    message: string,
    code?: string,
    detail?: string
  ) {
    super(message);
    this.name = "LmsError";
    this.status = status;
    this.path = path;
    this.code = code;
    this.detail = detail;
  }

  /** A run cannot recover from a credential the LMS no longer accepts. */
  get isAuth(): boolean {
    return this.status === UNAUTHORIZED || isRedirect(this.status);
  }
}

/** Every LMS reply wraps its payload; a refusal can arrive inside a 200. */
const envelopeSchema = z.looseObject({
  code: z.string().optional(),
  data: z.unknown().optional(),
  message: z.string().optional(),
  statusCode: z.number().optional(),
  success: z.boolean().optional(),
});

type Envelope = z.infer<typeof envelopeSchema>;

const parseEnvelope = (text: string): Envelope | undefined => {
  try {
    const decoded = envelopeSchema.safeParse(JSON.parse(text));
    return decoded.success ? decoded.data : undefined;
  } catch {
    return undefined;
  }
};

const refusedInside = (envelope: Envelope | undefined): boolean =>
  envelope?.success === false ||
  (envelope?.statusCode !== undefined && envelope.statusCode >= 400);

export const lmsRequest = async <T>(
  cookie: string,
  method: LmsMethod,
  path: string,
  schema: z.ZodType<T>,
  body?: LmsBody,
  signal?: AbortSignal
): Promise<T> => {
  const base = {
    ...browserGetHeaders(cookie, `${config.origin}${LMS_REFERER}`),
    "x-csrf-protection": "1",
  };
  const headers =
    body === undefined ? base : { ...base, "content-type": "application/json" };
  const response = await fetch(`${config.origin}${LMS_API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
    signal,
  });
  const text = await response.text();
  if (isRedirect(response.status)) {
    throw new LmsError(response.status, path, STALE);
  }
  const envelope = parseEnvelope(text);
  if (!response.ok || refusedInside(envelope)) {
    const status = envelope?.statusCode ?? response.status;
    throw new LmsError(
      status,
      path,
      explain(status, path, envelope?.message),
      envelope?.code,
      text.slice(0, DETAIL_LENGTH)
    );
  }
  const decoded = schema.safeParse(envelope?.data);
  if (!decoded.success) {
    throw new LmsError(
      BAD_GATEWAY,
      path,
      `the LMS answered ${path} in a shape the proxy does not read`,
      "shape",
      text.slice(0, DETAIL_LENGTH)
    );
  }
  return decoded.data;
};
