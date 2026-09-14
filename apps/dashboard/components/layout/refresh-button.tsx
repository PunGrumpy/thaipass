"use client";

import { useI18n } from "@thaipass/internationalization";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";

export const RefreshButton = () => {
  const { catalog, credits, health, refresh } = useGateway();
  const { t } = useI18n();

  const refreshing = health.loading || credits.loading || catalog.loading;
  const label = refreshing
    ? t.common.actions.refreshing
    : t.common.actions.refresh;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="size-7 aria-disabled:opacity-50"
            disabled={refreshing}
            focusableWhenDisabled
            onClick={refresh}
            size="icon"
            variant="ghost"
          />
        }
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
};
