export const LOCALES = ["en", "th"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  th: "ภาษาไทย",
};

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export const isLocale = (value: string | undefined): value is Locale =>
  value === "en" || value === "th";
