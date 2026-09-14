import { errorMessage } from "./format";

export type Attempt<T> = { data: T; ok: true } | { message: string; ok: false };

export const attempt = async <T>(
  run: () => Promise<T>
): Promise<Attempt<T>> => {
  try {
    return { data: await run(), ok: true };
  } catch (error) {
    return { message: errorMessage(error), ok: false };
  }
};
