"use client";

import { useI18n } from "@thaipass/internationalization";
import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { CatalogSlice } from "@/components/overview/catalog-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { countByKind, KIND_LABELS, MODEL_KINDS } from "@/lib/catalog";
import { fill } from "@/lib/format";
import type { CatalogModel } from "@/lib/proxy";

const CatalogChart = dynamic(
  () => import("@/components/overview/catalog-chart"),
  {
    loading: () => (
      <Skeleton className="mx-auto aspect-square w-[120px] rounded-full" />
    ),
    ssr: false,
  }
);

export const CatalogCard = ({
  models,
}: {
  readonly models: readonly CatalogModel[];
}) => {
  const { t } = useI18n();
  const { catalog } = t.overview;

  const slices = useMemo(() => {
    const counts = countByKind(models);
    const list: CatalogSlice[] = [];
    for (const kind of MODEL_KINDS) {
      if (counts[kind] > 0) {
        list.push({
          fill: `var(--color-${kind})`,
          kind,
          label: KIND_LABELS[kind],
          value: counts[kind],
        });
      }
    }
    return list;
  }, [models]);

  const pricedCount = useMemo(
    () => models.filter((model) => model.pricing).length,
    [models]
  );

  return (
    <div className="grid items-center gap-4 rounded-xl border p-4 sm:grid-cols-[140px_1fr]">
      <CatalogChart slices={slices} />

      <div className="space-y-3">
        <ul className="space-y-1.5">
          {slices.map((slice) => (
            <li className="flex items-center gap-2 text-sm" key={slice.kind}>
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: slice.fill }}
              />
              <span className="text-muted-foreground">{slice.label}</span>
              <span className="ml-auto font-medium tabular-nums">
                {slice.value}
              </span>
            </li>
          ))}
        </ul>

        {pricedCount > 0 ? (
          <div className="flex items-center justify-between border-t pt-2.5 text-xs">
            <span className="text-muted-foreground">{catalog.pricedLabel}</span>
            <span className="font-medium tabular-nums">
              {fill(catalog.priced, pricedCount, models.length)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
