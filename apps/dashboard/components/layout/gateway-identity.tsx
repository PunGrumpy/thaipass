"use client";

import { useI18n } from "@thaipass/internationalization";
import Link from "next/link";

import { StatusDot } from "@/components/layout/status-dot";
import type { StatusTone } from "@/components/layout/status-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnection } from "@/hooks/use-connection";
import { useHealth } from "@/hooks/use-gateway";

const PROTOCOL = /^https?:\/\//u;

const LABELS: Record<StatusTone, string> = {
  checking: "Checking",
  offline: "Unreachable",
  online: "Connected",
};

const toneOf = (loading: boolean, online: boolean): StatusTone => {
  if (loading) {
    return "checking";
  }
  return online ? "online" : "offline";
};

/**
 * The bottom-of-sidebar identity row: which gateway this dashboard is pointed
 * at and whether it answers. Replaces the status pill that used to sit in the
 * app header.
 */
export const GatewayIdentity = () => {
  const { locale } = useI18n();
  const { proxyUrl } = useConnection();
  const { data, error, loading, online } = useHealth();
  const tone = toneOf(loading && !data, online);
  const host = proxyUrl.replace(PROTOCOL, "");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            className="hover:bg-sidebar-accent flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            href={`/${locale}/settings`}
          />
        }
      >
        <StatusDot
          label={`Gateway ${LABELS[tone].toLowerCase()}`}
          tone={tone}
        />
        <span className="shrink-0 text-xs font-medium group-data-[collapsible=icon]:hidden">
          {LABELS[tone]}
        </span>
        <span className="text-muted-foreground truncate font-mono text-xs group-data-[collapsible=icon]:hidden">
          {host}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span>
          {host}
          {data ? ` · upstream ${data.origin}` : ""}
          {error ? ` · ${error}` : ""}
        </span>
      </TooltipContent>
    </Tooltip>
  );
};
