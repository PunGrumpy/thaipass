"use client";

import { BrandTile } from "@/components/icons/brand";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * The sidebar is a sheet on mobile, so its trigger has to live in the content.
 * Desktop has no header at all.
 */
export const MobileBar = () => (
  <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
    <SidebarTrigger className="-ml-1" />
    <BrandTile className="size-6 rounded-md" />
    <span className="truncate text-sm font-medium">THAI passport</span>
  </div>
);
