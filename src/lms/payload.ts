import { z } from "zod";

/**
 * The LMS payloads were mapped from the web client's bundle rather than a
 * spec, so a reply is read as a loose object and the fields the proxy needs
 * are looked up by the names the client uses, at any depth.
 */

const SEARCH_DEPTH = 3;

/** A JSON object from the LMS whose fields the proxy has not mapped. */
export const payloadSchema = z.looseObject({});

export type Payload = z.infer<typeof payloadSchema>;

/** The LMS sends a number as a number or as a string depending on the route. */
export const numberishSchema = z
  .union([z.number(), z.string().transform(Number)])
  .pipe(z.number().finite());

/** An id the routes take as a path segment. */
export const idSchema = z.union([
  z.string().min(1),
  z.number().transform(String),
]);

/**
 * A field the LMS may send in another form than the one mapped here: read it,
 * or read nothing, rather than fail the whole reply over one field.
 */
export const lenient = <T>(schema: z.ZodType<T>): z.ZodType<T | undefined> =>
  z.preprocess(
    (value) => (schema.safeParse(value).success ? value : undefined),
    schema.optional()
  );

/** An id that may be absent, null or empty, as the lesson listing sends it before enrolment. */
export const optionalIdSchema = lenient(
  z.union([z.string(), z.number().transform(String)])
).transform((value) => value || undefined);

/** Depth-first for the first number under one of the keys. */
export const findNumber = (
  payload: Payload,
  keys: readonly string[],
  allowZero = false,
  depth = SEARCH_DEPTH
): number | undefined => {
  for (const key of keys) {
    const found = numberishSchema.safeParse(payload[key]);
    if (found.success && (found.data > 0 || (allowZero && found.data === 0))) {
      return found.data;
    }
  }
  if (depth <= 0) {
    return undefined;
  }
  for (const child of Object.values(payload)) {
    const nested = payloadSchema.safeParse(child);
    if (nested.success) {
      const found = findNumber(nested.data, keys, allowZero, depth - 1);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
};

/** Depth-first for the first object under one of the keys. */
export const findPayload = (
  payload: Payload,
  keys: readonly string[],
  depth = SEARCH_DEPTH
): Payload | undefined => {
  for (const key of keys) {
    const found = payloadSchema.safeParse(payload[key]);
    if (found.success) {
      return found.data;
    }
  }
  if (depth <= 0) {
    return undefined;
  }
  for (const child of Object.values(payload)) {
    const nested = payloadSchema.safeParse(child);
    if (nested.success) {
      const found = findPayload(nested.data, keys, depth - 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
};
