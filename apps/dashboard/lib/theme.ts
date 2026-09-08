import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ThemeOption {
  icon: LucideIcon;
  label: string;
  value: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
  { icon: Monitor, label: "System", value: "system" },
];
