import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ThemeValue = "dark" | "light" | "system";

export interface ThemeOption {
  icon: LucideIcon;
  value: ThemeValue;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { icon: Sun, value: "light" },
  { icon: Moon, value: "dark" },
  { icon: Monitor, value: "system" },
];
