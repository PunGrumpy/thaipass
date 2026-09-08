"use client";

import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";
import { THEME_OPTIONS } from "@/lib/theme";

const SPRING = { bounce: 0, duration: 0.3, type: "spring" } as const;
const HIDDEN = { filter: "blur(4px)", opacity: 0, scale: 0.25 } as const;
const SHOWN = { filter: "blur(0px)", opacity: 1, scale: 1 } as const;

export const ThemeToggle = () => {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const hydrated = useHydrated();
  const dark = hydrated && resolvedTheme === "dark";
  const Icon = dark ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Change theme"
            className="relative size-8"
            size="icon"
            variant="ghost"
          />
        }
      >
        {/* initial={false} keeps the icon from animating in on first paint. */}
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={SHOWN}
            exit={HIDDEN}
            initial={HIDDEN}
            key={dark ? "dark" : "light"}
            transition={SPRING}
          >
            <Icon className="size-4" />
          </motion.span>
        </AnimatePresence>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-36">
        <DropdownMenuRadioGroup
          onValueChange={setTheme}
          value={hydrated ? theme : undefined}
        >
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
