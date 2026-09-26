"use client";

import { useI18n } from "@thaipass/internationalization";
import { useTheme } from "next-themes";

import { Section } from "@/components/layout/section";
import { useHydrated } from "@/hooks/use-hydrated";
import { THEME_OPTIONS } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const AppearanceCard = () => {
  const { setTheme, theme } = useTheme();
  const hydrated = useHydrated();
  const { t } = useI18n();

  return (
    <Section
      description={t.settings.appearance.description}
      title={t.settings.appearance.title}
    >
      <fieldset className="grid max-w-sm grid-cols-3 gap-2">
        <legend className="sr-only">{t.common.theme.label}</legend>
        {THEME_OPTIONS.map((option) => {
          const selected = hydrated && theme === option.value;
          return (
            <label
              className={cn(
                "hover:bg-accent flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-xs",
                "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-3",
                selected && "border-foreground/40 bg-accent"
              )}
              key={option.value}
            >
              <input
                checked={selected}
                className="sr-only"
                name="theme"
                onChange={() => setTheme(option.value)}
                type="radio"
                value={option.value}
              />
              <option.icon className="size-4" />
              {t.common.theme[option.value]}
            </label>
          );
        })}
      </fieldset>
    </Section>
  );
};
