"use client";

import { useI18n } from "@thaipass/internationalization";

import { useConnection } from "@/hooks/use-connection";
import type { HealthResource } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";

interface Row {
  label: string;
  mono?: boolean;
  value: string | null;
}

export const GatewayCard = ({
  health,
}: {
  readonly health: HealthResource;
}) => {
  const { proxyUrl } = useConnection();
  const { t } = useI18n();
  const { gateway } = t.overview;
  const { data } = health;

  const costOf = (): string | null => {
    if (!data) {
      return null;
    }
    return data.prices ? gateway.costLive : gateway.costOff;
  };

  const rows: Row[] = [
    { label: gateway.rows.origin, mono: true, value: proxyUrl },
    { label: gateway.rows.upstream, mono: true, value: data?.origin ?? null },
    { label: gateway.rows.models, value: data ? String(data.models) : null },
    { label: gateway.rows.cost, value: costOf() },
  ];

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="text-muted-foreground bg-muted/40 border-b px-4 py-2 text-xs font-medium">
        {health.online ? gateway.online : (health.error ?? gateway.offline)}
      </div>

      <dl className="divide-y">
        {rows.map((row) => (
          <div
            className="flex items-center justify-between gap-4 px-4 py-2.5"
            key={row.label}
          >
            <dt className="text-muted-foreground text-sm">{row.label}</dt>
            <dd
              className={cn(
                "text-right text-xs break-all",
                row.mono ? "font-mono" : "font-medium tabular-nums"
              )}
            >
              {row.value === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
