"use client";

import { useI18n } from "@thaipass/internationalization";
import { usePathname } from "next/navigation";

import { BrandTile } from "@/components/icons/brand";
import { RefreshButton } from "@/components/layout/refresh-button";
import { SessionChip } from "@/components/layout/session-chip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavItems } from "@/lib/nav";

export const AppBar = () => {
  const pathname = usePathname();
  const { locale, t } = useI18n();
  const navItems = useNavItems();

  const current = navItems.find(
    (item) =>
      pathname === item.href ||
      (item.id === "overview" && pathname === `/${locale}`)
  );

  return (
    <header className="bg-background sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b px-3 md:grid md:grid-cols-[1fr_auto_1fr] md:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarTrigger
          className="-ml-1 md:hidden"
          label={t.navigation.toggleSidebar}
        />
        <BrandTile className="size-5 rounded-[6px] md:hidden" />
      </div>

      <h1 className="min-w-0 flex-1 truncate text-center text-[13px] font-medium md:flex-none">
        {current?.title ?? t.brand.name}
      </h1>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <RefreshButton />
        <SessionChip />
      </div>
    </header>
  );
};
