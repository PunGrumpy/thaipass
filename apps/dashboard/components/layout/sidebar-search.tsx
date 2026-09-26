"use client";

import { useI18n } from "@thaipass/internationalization";
import { Search } from "lucide-react";

import { useModifierKey } from "@/hooks/use-modifier-key";

export const SidebarSearch = ({ onOpen }: { readonly onOpen: () => void }) => {
  const modifier = useModifierKey();
  const { t } = useI18n();

  return (
    <button
      className="border-sidebar-border bg-background text-muted-foreground hover:border-sidebar-accent hover:text-foreground flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-[13px] group-data-[collapsible=icon]:hidden"
      onClick={onOpen}
      type="button"
    >
      <Search className="size-3.5 shrink-0 translate-y-[-0.5px]" />
      <span className="truncate">{t.navigation.search}</span>
      {modifier === null ? null : (
        <kbd className="border-border text-muted-foreground ml-auto shrink-0 rounded-sm border px-1 font-mono text-[10px]">
          {modifier}K
        </kbd>
      )}
    </button>
  );
};
