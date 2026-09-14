"use client";

import { useI18n } from "@thaipass/internationalization";
import type { ReactNode } from "react";

import { AppBar } from "@/components/layout/app-bar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { GatewayProvider } from "@/hooks/use-gateway";

const CONTENT_ID = "content";

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
          <AppBar />
          <main
            className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:px-6 md:py-6"
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
