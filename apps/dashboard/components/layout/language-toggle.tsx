"use client";

import {
  isLocale,
  LOCALE_LABELS,
  LOCALES,
  useI18n,
} from "@thaipass/internationalization";

import { LanguageIcon } from "@/components/icons/rune";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export const LanguageToggle = ({
  className,
}: {
  readonly className?: string;
}) => {
  const { locale, setLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className={className}
            tooltip={t.common.languages.label}
          />
        }
      >
        <LanguageIcon />
        <span>{t.common.languages.label}</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {LOCALE_LABELS[locale]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36" side="top">
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
