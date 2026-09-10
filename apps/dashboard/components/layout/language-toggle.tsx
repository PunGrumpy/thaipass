"use client";

import {
  isLocale,
  LOCALE_LABELS,
  LOCALES,
  useI18n,
} from "@thaipass/internationalization";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const LanguageToggle = () => {
  const { locale, setLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t.common.languages.label}
            className="relative size-8"
            size="icon"
            variant="ghost"
          />
        }
      >
        <Languages className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-36">
        <DropdownMenuRadioGroup
          onValueChange={(val) => {
            if (isLocale(val)) {
              setLocale(val);
            }
          }}
          value={locale}
        >
          {LOCALES.map((loc) => (
            <DropdownMenuRadioItem key={loc} value={loc}>
              {LOCALE_LABELS[loc]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
