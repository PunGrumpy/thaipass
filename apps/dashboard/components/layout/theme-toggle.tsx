"use client";

import { useI18n } from "@thaipass/internationalization";
import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useHydrated } from "@/hooks/use-hydrated";
import { THEME_OPTIONS } from "@/lib/theme";

const SPRING = { bounce: 0, duration: 0.3, type: "spring" } as const;
const INSTANT = { duration: 0 } as const;
const HIDDEN = { filter: "blur(4px)", opacity: 0, scale: 0.25 } as const;
const SHOWN = { filter: "blur(0px)", opacity: 1, scale: 1 } as const;

export const ThemeToggle = ({ className }: { readonly className?: string }) => {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const hydrated = useHydrated();
  const still = useReducedMotion();
  const { t } = useI18n();
  const dark = hydrated && resolvedTheme === "dark";
  const Icon = dark ? Moon : Sun;
  const active = THEME_OPTIONS.find((option) => option.value === theme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className={className}
            tooltip={t.common.theme.label}
          />
        }
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={SHOWN}
            className="flex size-4 shrink-0 items-center justify-center"
            exit={still ? SHOWN : HIDDEN}
            initial={still ? SHOWN : HIDDEN}
            key={dark ? "dark" : "light"}
            transition={still ? INSTANT : SPRING}
          >
            <Icon className="size-4" />
          </motion.span>
        </AnimatePresence>
        <span>{t.common.theme.label}</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {hydrated && active ? t.common.theme[active.value] : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36" side="top">
        <DropdownMenuRadioGroup
          onValueChange={setTheme}
          value={hydrated ? theme : undefined}
        >
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon />
              {t.common.theme[option.value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
