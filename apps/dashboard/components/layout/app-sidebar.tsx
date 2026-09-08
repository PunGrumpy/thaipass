"use client";

import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandTile } from "@/components/icons/brand";
import { GithubMark } from "@/components/icons/github-mark";
import { CommandMenu, useCommandMenu } from "@/components/layout/command-menu";
import { GatewayIdentity } from "@/components/layout/gateway-identity";
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
import { GITHUB_URL, NAV_ITEMS } from "@/lib/nav";
import { normalizeProxyUrl } from "@/lib/proxy";

export const AppSidebar = () => {
  const pathname = usePathname();
  const { proxyUrl } = useConnection();
  const commandMenu = useCommandMenu();
  const modifier = useModifierKey();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                className="gap-2 px-1.5 py-0 group-data-[collapsible=icon]:p-1.5!"
                render={<Link href="/" />}
              >
                <BrandTile className="size-5 rounded-[6px]" />
                <span className="truncate font-semibold">THAI passport</span>
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
                  tooltip="Search"
                >
                  <Search />
                  <span>Search</span>
                  {modifier === null ? null : (
                    <kbd className="bg-muted text-muted-foreground ml-auto rounded-sm border px-1 font-mono text-[11px]">
                      {modifier}K
                    </kbd>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
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
                      aria-label="Open the API reference"
                      href={`${normalizeProxyUrl(proxyUrl)}/`}
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                  tooltip="API reference"
                >
                  <BookOpen />
                  <span>API reference</span>
                  <ArrowUpRight className="ml-auto size-3.5 opacity-50" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a
                      aria-label="Open the project on GitHub"
                      href={GITHUB_URL}
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                  tooltip="GitHub"
                >
                  <GithubMark />
                  <span>GitHub</span>
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
          <ThemeToggle />
        </div>
      </SidebarFooter>

      <SidebarRail />
      <CommandMenu {...commandMenu} />
    </Sidebar>
  );
};
