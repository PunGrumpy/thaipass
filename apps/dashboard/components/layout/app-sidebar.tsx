"use client";

import { useI18n } from "@thaipass/internationalization";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandTile } from "@/components/icons/brand";
import { GithubMark } from "@/components/icons/github-mark";
import { CommandMenu, useCommandMenu } from "@/components/layout/command-menu";
import { GatewayIdentity } from "@/components/layout/gateway-identity";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useConnection } from "@/hooks/use-connection";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { GITHUB_URL, useNavItems } from "@/lib/nav";
import { normalizeProxyUrl } from "@/lib/proxy";

export const AppSidebar = () => {
  const pathname = usePathname();
  const { proxyUrl } = useConnection();
  const commandMenu = useCommandMenu();
  const modifier = useModifierKey();
  const { locale, t } = useI18n();
  const navItems = useNavItems();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                className="gap-2 px-1.5 py-0 group-data-[collapsible=icon]:p-1.5!"
                render={<Link href={`/${locale}`} />}
              >
                <BrandTile className="size-5 rounded-[6px]" />
                <span className="truncate font-semibold">{t.brand.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarTrigger className="shrink-0" size="icon" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => commandMenu.onOpenChange(true)}
                  tooltip={t.navigation.search}
                >
                  <Search />
                  <span>{t.navigation.search}</span>
                  {modifier === null ? null : (
                    <kbd className="bg-muted text-muted-foreground ml-auto rounded-sm border px-1 font-mono text-[11px]">
                      {modifier}K
                    </kbd>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={
                      pathname === item.href ||
                      (item.id === "overview" && pathname === `/${locale}`)
                    }
                    render={
                      <Link
                        aria-current={
                          pathname === item.href ? "page" : undefined
                        }
                        href={item.href}
                      />
                    }
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a
                      aria-label={t.navigation.apiReference}
                      href={`${normalizeProxyUrl(proxyUrl)}/`}
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                  tooltip={t.navigation.apiReference}
                >
                  <BookOpen />
                  <span>{t.navigation.apiReference}</span>
                  <ArrowUpRight className="ml-auto size-3.5 opacity-50" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a
                      aria-label={t.navigation.github}
                      href={GITHUB_URL}
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                  tooltip={t.navigation.github}
                >
                  <GithubMark />
                  <span>{t.navigation.github}</span>
                  <ArrowUpRight className="ml-auto size-3.5 opacity-50" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <GatewayIdentity />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </SidebarFooter>

      <SidebarRail />
      <CommandMenu {...commandMenu} />
    </Sidebar>
  );
};
