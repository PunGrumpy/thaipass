"use client";

import { useTheme } from "next-themes";

import { SettingsSection } from "@/components/settings/settings-section";
import { useHydrated } from "@/hooks/use-hydrated";
import { THEME_OPTIONS } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const AppearanceCard = () => {
  const { setTheme, theme } = useTheme();
  const hydrated = useHydrated();

  return (
    <SettingsSection
      description="System follows whatever your operating system is set to."
      title="Appearance"
    >
      <fieldset className="grid max-w-sm grid-cols-3 gap-2">
        <legend className="sr-only">Theme</legend>
        {THEME_OPTIONS.map((option) => {
          const selected = hydrated && theme === option.value;
          return (
            <label
              className={cn(
                "hover:bg-accent flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-colors",
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
              {option.label}
            </label>
          );
        })}
      </fieldset>
    </SettingsSection>
  );
};
