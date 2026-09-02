export interface ApiError {
  readonly error: { readonly message: string };
}

export const apiError = (message: string): ApiError => ({ error: { message } });

export const errorResponse = (message: string, code: number): Response =>
  Response.json(apiError(message), { status: code });
