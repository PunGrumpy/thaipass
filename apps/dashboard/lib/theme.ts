import type { ComponentProps, ComponentType } from "react";

import { MoonIcon, SunIcon, SystemIcon } from "@/components/icons/rune";

export type ThemeValue = "dark" | "light" | "system";

export interface ThemeOption {
  icon: ComponentType<ComponentProps<"svg">>;
  value: ThemeValue;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { icon: SunIcon, value: "light" },
  { icon: MoonIcon, value: "dark" },
  { icon: SystemIcon, value: "system" },
];
