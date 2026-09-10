"use client";

import {
  LOCALE_LABELS,
  LOCALES,
  useI18n,
} from "@thaipass/internationalization";
import { Languages } from "lucide-react";

import { SettingsSection } from "@/components/settings/settings-section";
import { cn } from "@/lib/utils";

export const LanguageCard = () => {
  const { locale, setLocale, t } = useI18n();

  return (
    <SettingsSection
      description={t.settings.language.description}
      title={t.settings.language.title}
    >
      <fieldset className="grid max-w-sm grid-cols-2 gap-2">
        <legend className="sr-only">{t.settings.language.title}</legend>
        {LOCALES.map((loc) => {
          const selected = locale === loc;
          return (
            <label
              className={cn(
                "hover:bg-accent flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-colors",
                "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-3",
                selected && "border-foreground/40 bg-accent"
              )}
              key={loc}
            >
              <input
                checked={selected}
                className="sr-only"
                name="locale"
                onChange={() => setLocale(loc)}
                type="radio"
                value={loc}
              />
              <Languages className="size-4" />
              <span className="font-medium">{LOCALE_LABELS[loc]}</span>
            </label>
          );
        })}
      </fieldset>
    </SettingsSection>
  );
};
