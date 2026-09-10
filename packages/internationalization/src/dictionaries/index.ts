import type { Locale } from "../types";
import { en } from "./en";
import { th } from "./th";

export { en, type Dictionary } from "./en";
export { th } from "./th";

export const dictionaries = {
  en,
  th,
};

export const getDictionary = (locale: Locale) =>
  dictionaries[locale] ?? dictionaries.en;
