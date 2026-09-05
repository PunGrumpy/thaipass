import { z } from "zod";

import { browserGetHeaders } from "../aipass/request";
import { config } from "../lib/config";

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
const BAD_GATEWAY = 502;

export type LmsMethod = "GET" | "POST" | "PUT" | "DELETE";

/** What the proxy sends the LMS: ids, paging and playback figures, nothing nested. */
export interface LmsBody {
  readonly [field: string]: string | number;
}

const isRedirect = (status: number): boolean =>
  status >= REDIRECT_LOW && status < REDIRECT_HIGH;

const STALE = "the LMS redirected to sign-in; cookie is stale, re-auth needed";

const explainUnauthorized = (path: string, message: string | undefined) =>
  `the LMS answered 401 on ${path}${message ? ` (${message})` : ""}; the cookie is stale, or was not copied from a browser that has opened /lms`;

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
    const message =
      status === UNAUTHORIZED
        ? explainUnauthorized(path, envelope?.message)
        : `the LMS answered ${status} on ${path}${envelope?.message ? `: ${envelope.message}` : ""}`;
    throw new LmsError(
      status,
      path,
      message,
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
