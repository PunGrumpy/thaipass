"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

import type { Dictionary } from "./dictionaries/en";
import type { Locale } from "./types";
import { isLocale, LOCALE_COOKIE_NAME } from "./types";

interface I18nContextValue {
  dictionary: Dictionary;
  locale: Locale;
  setLocale: (newLocale: Locale) => void;
  t: Dictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  dictionary: Dictionary;
  locale: Locale;
}

export const I18nProvider = ({
  children,
  dictionary,
  locale,
}: I18nProviderProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (newLocale === locale) {
        return;
      }

      // Persist user selection in cookie for 1 year
      // oxlint-disable-next-line unicorn/no-document-cookie
      document.cookie = `${LOCALE_COOKIE_NAME}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;

      // Replace locale prefix in the URL
      if (pathname) {
        const segments = pathname.split("/").filter(Boolean);
        if (segments.length > 0 && isLocale(segments[0])) {
          segments[0] = newLocale;
          router.push(`/${segments.join("/")}`);
        } else {
          router.push(
            `/${newLocale}${pathname.startsWith("/") ? pathname : `/${pathname}`}`
          );
        }
      } else {
        router.push(`/${newLocale}`);
      }
    },
    [locale, pathname, router]
  );

  const value = useMemo(
    () => ({
      dictionary,
      locale,
      setLocale,
      t: dictionary,
    }),
    [dictionary, locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};
