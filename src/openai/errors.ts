import { z } from "zod";

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

export type ApiError = z.infer<typeof apiErrorSchema>;
export type UpstreamError = z.infer<typeof upstreamErrorSchema>;

export const apiError = (message: string): ApiError => ({ error: { message } });

export const errorResponse = (message: string, code: number): Response =>
  Response.json(apiError(message), { status: code });
