/**
 * OpenAI clients only read `{ error: { message } }`. Every failure the proxy
 * reports uses this shape, whether it came from the proxy or from upstream.
 */
export interface ApiError {
  readonly error: { readonly message: string };
}

export const apiError = (message: string): ApiError => ({ error: { message } });

export const errorResponse = (message: string, code: number): Response =>
  Response.json(apiError(message), { status: code });
