"use client";

import { StatCard } from "@/components/overview/stat-card";
import type { CatalogResource } from "@/hooks/use-gateway";
import type { Resource } from "@/hooks/use-resource";
import { formatPercent, formatResetAt } from "@/lib/format";
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

const freeFooterOf = (priced: number, chat: number): string =>
  priced > 0
    ? `${priced} models priced via OpenRouter`
    : `${chat} of them answer chat requests`;

export const StatRow = ({ catalog, credits }: StatRowProps) => {
  const balance = credits.data;
  const percent = balance ? formatPercent(balance.used, balance.limit) : null;
  const waiting = credits.loading && !balance;
  // Matches the platform's credit cell: the number that needs action is the
  // only coloured thing on the row, and it carries an icon as well as a tint.
  const low =
    balance !== null &&
    (balance.available === 0 || (percent ?? 0) >= LOW_CREDIT_PERCENT);

  const { chat, free, priced } = breakdownOf(catalog.models);

  return (
    <div className="bg-border ring-border grid gap-px overflow-hidden rounded-xl ring-1 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        footer={
          balance ? `Resets ${formatResetAt(balance.reset_at)}` : "No session"
        }
        label="Credits available"
        loading={waiting}
        tone={low ? "warning" : "default"}
        value={balance?.available ?? null}
      />
      <StatCard
        footer={
          percent === null ? "No session" : `${percent}% of the period used`
        }
        label="Credits used"
        loading={waiting}
        suffix={balance ? `/ ${balance.limit.toLocaleString()}` : undefined}
        value={balance?.used ?? null}
      />
      <StatCard
        footer={
          catalog.builtin
            ? "Built-in list. Connect a session for yours"
            : "Live from your account catalog"
        }
        label="Models reachable"
        loading={catalog.loading && catalog.builtin}
        value={catalog.models.length}
      />
      <StatCard
        footer={freeFooterOf(priced, chat)}
        label="Free models"
        loading={catalog.loading && catalog.builtin}
        value={free}
      />
    </div>
  );
};
