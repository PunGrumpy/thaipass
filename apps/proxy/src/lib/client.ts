export interface ClientFields {
  readonly city?: string;
  readonly clientIp?: string;
  readonly country?: string;
  readonly region?: string;
  readonly timezone?: string;
  readonly userAgent?: string;
  readonly $ip?: string;
  readonly $raw_user_agent?: string;
}

const header = (request: Request, name: string): string | undefined =>
  request.headers.get(name) ?? undefined;

export const clientFields = (request: Request): ClientFields => {
  const forwarded = header(request, "x-forwarded-for");
  const clientIp =
    forwarded?.split(",")[0]?.trim() || header(request, "x-real-ip");
  const userAgent = header(request, "user-agent");
  return {
    $ip: clientIp,
    $raw_user_agent: userAgent,
    city: header(request, "x-vercel-ip-city"),
    clientIp,
    country: header(request, "x-vercel-ip-country"),
    region: header(request, "x-vercel-ip-country-region"),
    timezone: header(request, "x-vercel-ip-timezone"),
    userAgent,
  };
};
