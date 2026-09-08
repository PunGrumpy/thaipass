import { errorMessage } from "./format";

export type Attempt<T> = { data: T; ok: true } | { message: string; ok: false };

/**
 * Turns a throwing call into a value. Components can then branch on the result
 * instead of carrying a try/catch, which keeps their bodies compilable by the
 * React compiler and their error text in one shape.
 */
export const attempt = async <T>(
  run: () => Promise<T>
): Promise<Attempt<T>> => {
  try {
    return { data: await run(), ok: true };
  } catch (error) {
    return { message: errorMessage(error), ok: false };
  }
};
