"use client";

import { useI18n } from "@thaipass/internationalization";
import Link from "next/link";
import { useState } from "react";

import { VendorChip } from "@/components/models/vendor-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KIND_LABELS, vendorOf } from "@/lib/catalog";
import { fill, formatRatePerMillion } from "@/lib/format";
import type { CatalogModel } from "@/lib/proxy";

const PAGE_SIZE = 9;

const ModelCard = ({
  locale,
  model,
  freeLabel,
}: {
  readonly freeLabel: string;
  readonly locale: string;
  readonly model: CatalogModel;
}) => (
  <Link
    className="hover:border-muted-foreground/30 focus-visible:ring-ring flex flex-col gap-3 rounded-xl border p-4 focus-visible:ring-2 focus-visible:outline-none"
    href={`/${locale}/playground?model=${encodeURIComponent(model.id)}`}
  >
    <div className="flex min-w-0 items-start gap-2.5">
      <VendorChip className="mt-0.5" modelId={model.id} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[13px]">{model.id}</div>
        <div className="text-muted-foreground truncate text-xs">
          {vendorOf(model.id)}
        </div>
      </div>
    </div>

    <div className="mt-auto flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">{KIND_LABELS[model.kind]}</Badge>
      {model.free ? (
        <Badge className="border-success/30 text-success" variant="outline">
          {freeLabel}
        </Badge>
      ) : null}
      {model.pricing ? (
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {formatRatePerMillion(model.pricing.prompt)} in
        </span>
      ) : null}
    </div>
  </Link>
);

export const ModelGrid = ({
  models,
}: {
  readonly models: readonly CatalogModel[];
}) => {
  const [shown, setShown] = useState(PAGE_SIZE);
  const { locale, t } = useI18n();
  const { grid } = t.overview;

  const visible = models.slice(0, shown);
  const remaining = models.length - visible.length;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((model) => (
          <ModelCard
            freeLabel={grid.free}
            key={model.id}
            locale={locale}
            model={model}
          />
        ))}
      </div>

      {remaining > 0 ? (
        <Button
          className="w-full"
          onClick={() => setShown((current) => current + PAGE_SIZE)}
          variant="outline"
        >
          {fill(grid.more, remaining)}
        </Button>
      ) : null}
    </div>
  );
};
