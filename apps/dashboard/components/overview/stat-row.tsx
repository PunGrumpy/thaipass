"use client";

import { useI18n } from "@thaipass/internationalization";

import { StatCard } from "@/components/overview/stat-card";
import type { CatalogResource } from "@/hooks/use-gateway";
import type { Resource } from "@/hooks/use-resource";
import { fill, formatPercent, formatResetAt } from "@/lib/format";
import type { CreditBalance } from "@/lib/proxy";

const LOW_CREDIT_PERCENT = 90;

export interface StatRowProps {
  catalog: CatalogResource;
  credits: Resource<CreditBalance>;
}

interface CatalogBreakdown {
  chat: number;
  free: number;
  priced: number;
}

const breakdownOf = (models: CatalogResource["models"]): CatalogBreakdown => {
  let free = 0;
  let chat = 0;
  let priced = 0;
  for (const model of models) {
    if (model.free) {
      free += 1;
    }
    if (model.kind === "chat") {
      chat += 1;
    }
    if (model.pricing) {
      priced += 1;
    }
  }
  return { chat, free, priced };
};

export const StatRow = ({ catalog, credits }: StatRowProps) => {
  const { t } = useI18n();
  const { stats } = t.overview;
  const balance = credits.data;
  const percent = balance ? formatPercent(balance.used, balance.limit) : null;
  const waiting = credits.loading && !balance;
  // Matches the platform's credit cell: the number that needs action is the
  // only coloured thing on the row, and it carries an icon as well as a tint.
  const low =
    balance !== null &&
    (balance.available === 0 || (percent ?? 0) >= LOW_CREDIT_PERCENT);

  const { chat, free, priced } = breakdownOf(catalog.models);
  const freeFooter =
    priced > 0 ? fill(stats.free.priced, priced) : fill(stats.free.chat, chat);

  return (
    <div className="bg-border ring-border grid gap-px overflow-hidden rounded-xl ring-1 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        footer={
          balance
            ? fill(stats.credits.resets, formatResetAt(balance.reset_at))
            : stats.noSession
        }
        label={stats.credits.label}
        loading={waiting}
        tone={low ? "warning" : "default"}
        value={balance?.available ?? null}
      />
      <StatCard
        footer={
          percent === null ? stats.noSession : fill(stats.used.share, percent)
        }
        label={stats.used.label}
        loading={waiting}
        suffix={balance ? `/ ${balance.limit.toLocaleString()}` : undefined}
        value={balance?.used ?? null}
      />
      <StatCard
        footer={catalog.builtin ? stats.catalog.builtin : stats.catalog.live}
        label={stats.catalog.label}
        loading={catalog.loading && catalog.builtin}
        value={catalog.models.length}
      />
      <StatCard
        footer={freeFooter}
        label={stats.free.label}
        loading={catalog.loading && catalog.builtin}
        value={free}
      />
    </div>
  );
};
