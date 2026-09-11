"use client";

import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useConnection } from "@/hooks/use-connection";
import type { HealthResource } from "@/hooks/use-gateway";
import { normalizeProxyUrl } from "@/lib/proxy";
import { cn } from "@/lib/utils";

interface Row {
  label: string;
  mono?: boolean;
  value: string;
}

export const GatewayCard = ({
  health,
}: {
  readonly health: HealthResource;
}) => {
  const { proxyUrl } = useConnection();
  const reference = `${normalizeProxyUrl(proxyUrl)}/`;

  const rows: Row[] = [
    { label: "Proxy origin", mono: true, value: proxyUrl },
    { label: "Upstream", mono: true, value: health.data?.origin ?? "unknown" },
    {
      label: "Built-in chat models",
      value: health.data ? String(health.data.models) : "—",
    },
    {
      label: "Cost estimation",
      value: health.data?.prices ? "OpenRouter (live)" : "Disabled",
    },
  ];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Gateway</CardTitle>
        <CardDescription>
          {health.online
            ? "Reachable and forwarding to AI Pass."
            : (health.error ?? "Waiting for the gateway to answer.")}
        </CardDescription>
        <CardAction>
          <Button
            nativeButton={false}
            render={
              <a
                aria-label="Open the API reference"
                href={reference}
                rel="noopener noreferrer"
                target="_blank"
              />
            }
            size="sm"
            variant="outline"
          >
            API reference
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="px-0">
        <dl className="divide-y">
          {rows.map((row) => (
            <div
              className="flex items-center justify-between gap-4 px-(--card-spacing) py-2 first:pt-0 last:pb-0"
              key={row.label}
            >
              <dt className="text-muted-foreground text-sm">{row.label}</dt>
              <dd
                className={cn(
                  "text-right text-xs break-all",
                  row.mono ? "font-mono" : "font-medium tabular-nums"
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
};
