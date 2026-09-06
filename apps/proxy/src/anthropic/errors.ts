import { z } from "zod";

import type { Failure } from "../turn";

export const anthropicErrorSchema = z.object({
  error: z.object({
    detail: z.string().optional(),
    location: z.string().optional(),
    message: z.string(),
    type: z.string(),
  }),
  type: z.literal("error"),
});

export type AnthropicError = z.infer<typeof anthropicErrorSchema>;

const ERROR_TYPES = new Map([
  [400, "invalid_request_error"],
  [401, "authentication_error"],
  [404, "not_found_error"],
  [502, "api_error"],
]);

export const anthropicError = (failure: Failure): AnthropicError => ({
  error: {
    detail: failure.detail,
    location: failure.location,
    message: failure.message,
    type: ERROR_TYPES.get(failure.status) ?? "api_error",
  },
  type: "error",
});

export const anthropicFailure = (failure: Failure): Response =>
  Response.json(anthropicError(failure), { status: failure.status });
