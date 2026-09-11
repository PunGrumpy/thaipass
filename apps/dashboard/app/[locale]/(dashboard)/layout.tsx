"use client";

import { useI18n } from "@thaipass/internationalization";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileBar } from "@/components/layout/mobile-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { GatewayProvider } from "@/hooks/use-gateway";

const CONTENT_ID = "content";

/**
 * Sidebar and content sit flush, with no floating panel and no app header:
 * a page begins at its own title, and the chrome that used to live in a top
 * bar is in the sidebar.
 */
const DashboardLayout = ({ children }: { readonly children: ReactNode }) => {
  const { t } = useI18n();

  return (
    <GatewayProvider>
      <SidebarProvider>
        <a
          className="bg-primary text-primary-foreground sr-only -translate-y-full rounded-lg px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:translate-y-0"
          href={`#${CONTENT_ID}`}
        >
          {t.navigation.skipToContent}
        </a>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <MobileBar />
          <main
            className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10"
            id={CONTENT_ID}
          >
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </GatewayProvider>
  );
};

export default DashboardLayout;
