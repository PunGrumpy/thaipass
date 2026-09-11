"use client";

import { useI18n } from "@thaipass/internationalization";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";

import type { CatalogSlice } from "@/components/overview/catalog-chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { countByKind, KIND_LABELS, MODEL_KINDS } from "@/lib/catalog";
import type { CatalogModel } from "@/lib/proxy";

const CatalogChart = dynamic(
  () => import("@/components/overview/catalog-chart"),
  {
    loading: () => (
      <Skeleton className="mx-auto aspect-square w-[160px] rounded-full" />
    ),
    ssr: false,
  }
);

export const CatalogCard = ({
  models,
}: {
  readonly models: readonly CatalogModel[];
}) => {
  const { locale } = useI18n();
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
    () =>
      models.filter(
        (model) => model.pricing !== null && model.pricing !== undefined
      ).length,
    [models]
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Catalog mix</CardTitle>
        <CardDescription>
          {models.length} models across chat and media endpoints.
        </CardDescription>
        <CardAction>
          <Button
            nativeButton={false}
            render={<Link href={`/${locale}/models`} />}
            size="sm"
            variant="ghost"
          >
            Browse models
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="grid items-center gap-4 sm:grid-cols-[160px_1fr]">
        <CatalogChart slices={slices} />

        <div className="space-y-3">
          <ul className="space-y-2">
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
              <span className="text-muted-foreground">Market pricing</span>
              <span className="text-foreground font-medium tabular-nums">
                {pricedCount} of {models.length} priced
              </span>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
