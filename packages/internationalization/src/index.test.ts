import { describe, expect, it } from "bun:test";

import {
  DEFAULT_LOCALE,
  en,
  getDictionary,
  isLocale,
  LOCALES,
  matchLocaleFromHeader,
  th,
} from "./index";

describe("@thaipass/internationalization", () => {
  it("defines supported locales correctly", () => {
    expect(LOCALES).toEqual(["en", "th"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("validates locale strings with isLocale", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("th")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    const undefinedLocale: string | undefined = undefined;
    expect(isLocale(undefinedLocale)).toBe(false);
  });

  it("retrieves dictionary by locale", () => {
    expect(getDictionary("en")).toBe(en);
    expect(getDictionary("th")).toBe(th);
    // @ts-expect-error testing invalid locale fallback at runtime
    expect(getDictionary("unknown")).toBe(en);
  });

  it("has identical dictionary top-level keys between en and th", () => {
    const enKeys = Object.keys(en).toSorted();
    const thKeys = Object.keys(th).toSorted();
    expect(thKeys).toEqual(enKeys);
  });

  it("matches locale from Accept-Language header", () => {
    expect(matchLocaleFromHeader(null)).toBe("en");
    expect(matchLocaleFromHeader("")).toBe("en");
    expect(matchLocaleFromHeader("th-TH,th;q=0.9,en;q=0.8")).toBe("th");
    expect(matchLocaleFromHeader("en-US,en;q=0.9,th;q=0.8")).toBe("en");
    expect(matchLocaleFromHeader("fr-FR,fr;q=0.9")).toBe("en");
  });
});
