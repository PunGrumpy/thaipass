"use client";

import { useI18n } from "@thaipass/internationalization";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandTile } from "@/components/icons/brand";
import { GithubMark } from "@/components/icons/github-mark";
import { DocsIcon, ExternalLinkIcon } from "@/components/icons/rune";
import { CommandMenu, useCommandMenu } from "@/components/layout/command-menu";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { SidebarSearch } from "@/components/layout/sidebar-search";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useConnection } from "@/hooks/use-connection";
import { GITHUB_URL, useNavSections } from "@/lib/nav";
import { normalizeProxyUrl } from "@/lib/proxy";

const ROW = "h-8 gap-2 px-2 text-[13px]";

export const AppSidebar = () => {
  const pathname = usePathname();
  const { proxyUrl } = useConnection();
  const commandMenu = useCommandMenu();
  const { locale, t } = useI18n();
  const sections = useNavSections();

  return (
    <Sidebar
      collapsible="icon"
      mobileDescription={t.navigation.sidebarDescription}
      mobileLabel={t.navigation.sidebar}
    >
      <SidebarHeader className="gap-2 p-2">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-8 gap-2 px-1.5 py-0 text-[13px] group-data-[collapsible=icon]:p-1.5!"
                render={<Link href={`/${locale}`} />}
              >
                <BrandTile className="size-5 rounded-[6px]" />
                <span className="truncate font-medium">{t.brand.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarTrigger
            className="shrink-0"
            label={t.navigation.toggleSidebar}
            size="icon"
          />
        </div>

        <SidebarSearch onOpen={() => commandMenu.onOpenChange(true)} />

        <SidebarMenu className="hidden group-data-[collapsible=icon]:block">
          <SidebarMenuItem>
            <SidebarMenuButton
              className={ROW}
              onClick={() => commandMenu.onOpenChange(true)}
              tooltip={t.navigation.search}
            >
              <Search />
              <span>{t.navigation.search}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {sections.map((section) => (
          <SidebarGroup className="py-1" key={section.id}>
            <SidebarGroupLabel className="h-7 px-2 text-[11px] tracking-wide">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      className={ROW}
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
        ))}

        <SidebarGroup className="mt-auto py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={ROW}
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
                  <DocsIcon />
                  <span>{t.navigation.apiReference}</span>
                  <ExternalLinkIcon className="ml-auto size-3.5 opacity-50" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={ROW}
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
                  <ExternalLinkIcon className="ml-auto size-3.5 opacity-50" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <LanguageToggle className={ROW} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <ThemeToggle className={ROW} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail label={t.navigation.toggleSidebar} />
      <CommandMenu {...commandMenu} />
    </Sidebar>
  );
};
