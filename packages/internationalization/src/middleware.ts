import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Locale } from "./types";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_NAME, LOCALES } from "./types";

const PUBLIC_FILE_PATTERN = /\.(?<ext>[^/]+)$/u;

export const matchLocaleFromHeader = (
  acceptLanguage: string | null
): Locale => {
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }

  const parsed = acceptLanguage
    .toLowerCase()
    .split(",")
    .map((item) => {
      const [lang, q] = item.trim().split(";q=");
      return { lang: lang?.trim() ?? "", q: q ? Number(q) : 1 };
    })
    .toSorted((a, b) => b.q - a.q);

  for (const { lang } of parsed) {
    if (lang === "th" || lang.startsWith("th-")) {
      return "th";
    }
    if (lang === "en" || lang.startsWith("en-")) {
      return "en";
    }
  }

  return DEFAULT_LOCALE;
};

export const resolveLocale = (request: NextRequest): Locale => {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const acceptLanguage = request.headers.get("accept-language");
  return matchLocaleFromHeader(acceptLanguage);
};

export const internationalizationMiddleware = (
  request: NextRequest
): NextResponse => {
  const { pathname, search } = request.nextUrl;

  // Ignore internal Next.js assets, API routes, and public files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    PUBLIC_FILE_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Check if pathname starts with a supported locale
  const pathnameHasLocale = LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // Resolve target locale
  const locale = resolveLocale(request);
  const targetPath = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  const redirectUrl = new URL(`${targetPath}${search}`, request.url);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: 31_536_000,
    path: "/",
    sameSite: "lax",
  });

  return response;
};
