"use client";

import { useI18n } from "@thaipass/internationalization";
import { Brain, Ratio, Server } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CatalogModel } from "@/lib/proxy";

export type CapabilityId = "provider" | "reasoning" | "resolutions";

interface Capability {
  icon: LucideIcon;
  id: CapabilityId;
  has: (model: CatalogModel) => boolean;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    has: (model) => (model.thinking?.length ?? 0) > 0,
    icon: Brain,
    id: "reasoning",
  },
  {
    has: (model) => (model.options?.resolutions?.length ?? 0) > 0,
    icon: Ratio,
    id: "resolutions",
  },
  {
    has: (model) => Boolean(model.options?.provider),
    icon: Server,
    id: "provider",
  },
];

export const capabilitiesOf = (model: CatalogModel): readonly Capability[] =>
  CAPABILITIES.filter((capability) => capability.has(model));

export const CapabilityIcons = ({
  model,
}: {
  readonly model: CatalogModel;
}) => {
  const { t } = useI18n();
  const names = t.models.capabilityNames;
  const present = capabilitiesOf(model);

  if (present.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <span className="flex items-center gap-1.5">
      {present.map((capability) => (
        <Tooltip key={capability.id}>
          <TooltipTrigger
            render={<span className="text-muted-foreground inline-flex" />}
          >
            <capability.icon className="size-3.5" />
            <span className="sr-only">{names[capability.id]}</span>
          </TooltipTrigger>
          <TooltipContent>{names[capability.id]}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
};
