import { z } from "zod";

import type { Failure } from "../turn";

export const apiErrorSchema = z.object({
  error: z.object({ message: z.string() }),
});

export const upstreamErrorSchema = z.object({
  error: z.object({
    detail: z.string(),
    location: z.string().optional(),
    message: z.string(),
  }),
});

/** A 400 carries the upstream shape when the edge refused, and the bare one otherwise. */
export const requestErrorSchema = z.union([
  upstreamErrorSchema,
  apiErrorSchema,
]);

export type ApiError = z.infer<typeof apiErrorSchema>;
export type UpstreamError = z.infer<typeof upstreamErrorSchema>;

export const apiError = (message: string): ApiError => ({ error: { message } });

const openaiError = (failure: Failure): ApiError | UpstreamError =>
  failure.detail === undefined
    ? apiError(failure.message)
    : {
        error: {
          detail: failure.detail,
          location: failure.location,
          message: failure.message,
        },
      };

export const openaiFailure = (failure: Failure): Response =>
  Response.json(openaiError(failure), { status: failure.status });
