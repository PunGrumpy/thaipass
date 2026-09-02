const SESSION_TOKEN = "__Secure-ai_passport_auth.session_token";

export const cookieFromRequest = (request: Request): string | null => {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const [scheme = "", ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }
  const cookie = rest.join(" ").trim();
  if (!cookie.includes(SESSION_TOKEN)) {
    return null;
  }
  return cookie;
};
