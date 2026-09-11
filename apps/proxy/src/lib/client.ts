export interface ClientFields {
  readonly app?: string;
  readonly city?: string;
  readonly clientIp?: string;
  readonly country?: string;
  readonly region?: string;
  readonly timezone?: string;
  readonly userAgent?: string;
  readonly $ip?: string;
  readonly $raw_user_agent?: string;
}

/** How much of the caller's own name for itself the log keeps. */
const APP_NAME_LIMIT = 64;

const header = (request: Request, name: string): string | undefined =>
  request.headers.get(name) ?? undefined;

/**
 * The name a caller gives itself in `x-thaipass-app`. Every caller of one
 * account shares a cookie, so this is the only field that tells two apps
 * apart when both hold yours.
 */
const appName = (request: Request): string | undefined => {
  const name = header(request, "x-thaipass-app")?.trim();
  if (name === undefined || name.length === 0) {
    return;
  }
  return name.slice(0, APP_NAME_LIMIT);
};

export const clientFields = (request: Request): ClientFields => {
  const forwarded = header(request, "x-forwarded-for");
  const clientIp =
    forwarded?.split(",")[0]?.trim() || header(request, "x-real-ip");
  const userAgent = header(request, "user-agent");
  return {
    $ip: clientIp,
    $raw_user_agent: userAgent,
    app: appName(request),
    city: header(request, "x-vercel-ip-city"),
    clientIp,
    country: header(request, "x-vercel-ip-country"),
    region: header(request, "x-vercel-ip-country-region"),
    timezone: header(request, "x-vercel-ip-timezone"),
    userAgent,
  };
};
