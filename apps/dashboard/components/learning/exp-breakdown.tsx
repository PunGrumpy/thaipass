"use client";

import { useI18n } from "@thaipass/internationalization";
import type { ComponentProps, ComponentType } from "react";
import { useState } from "react";

import { DocsIcon as FileTextIcon, LayersIcon } from "@/components/icons/rune";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { MeterRing } from "@/components/ui/meter-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { fill } from "@/lib/format";
import type { LessonTypeExp } from "@/lib/lms";
import { MONTHLY_TARGET } from "@/lib/lms";
import { cn } from "@/lib/utils";

const FULL_PERCENT = 100;
const PAGE_SIZE = 6;

interface Row {
  id: string;
  label: string;
  limit?: number;
  note?: string;
  value: number | null;
}

interface Group {
  icon: ComponentType<ComponentProps<"svg">>;
  id: string;
  label: string;
  rows: readonly Row[];
  tally: string | null;
}

export interface ExpBreakdownProps {
  loading: boolean;
  monthly: number | null;
  perLessonType: readonly LessonTypeExp[];
  standard: number | null;
}

const BreakdownRow = ({
  loading,
  row,
}: {
  readonly loading: boolean;
  readonly row: Row;
}) => {
  const share =
    row.value === null || !row.limit
      ? null
      : (row.value / row.limit) * FULL_PERCENT;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="flex min-w-0 items-center gap-2.5">
        <MeterRing className="text-muted-foreground" percent={share} />
        <span className="min-w-0">
          <span className="block truncate text-sm">{row.label}</span>
          {row.note ? (
            <span className="text-muted-foreground block truncate text-xs">
              {row.note}
            </span>
          ) : null}
        </span>
      </dt>

      <dd className="shrink-0 text-sm tabular-nums">
        {loading && row.value === null ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          <>
            <span className={cn(row.value === null && "text-muted-foreground")}>
              {row.value === null ? "—" : row.value.toLocaleString()}
            </span>
            {row.limit ? (
              <span className="text-muted-foreground">
                {" / "}
                {row.limit.toLocaleString()}
              </span>
            ) : null}
          </>
        )}
      </dd>
    </div>
  );
};

const BreakdownCard = ({
  empty,
  exp,
  group,
  loading,
  more,
}: {
  readonly empty: string;
  readonly exp: string;
  readonly group: Group;
  readonly loading: boolean;
  readonly more: string;
}) => {
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = group.rows.slice(0, shown);
  const remaining = group.rows.length - visible.length;

  return (
    <section className="overflow-hidden rounded-xl border">
      <h3 className="bg-muted/40 text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-xs font-medium">
        <group.icon className="size-3.5 shrink-0" />
        <span>{group.label}</span>
        <span className="ml-auto tabular-nums">
          {group.tally ? `${group.tally} ${exp}` : exp}
        </span>
      </h3>

      {group.rows.length === 0 ? (
        <div className="px-4 py-6">
          {loading ? (
            <Skeleton className="mx-auto h-4 w-48" />
          ) : (
            <EmptyState className="py-4">{empty}</EmptyState>
          )}
        </div>
      ) : (
        <>
          <dl className="divide-y">
            {visible.map((row) => (
              <BreakdownRow key={row.id} loading={loading} row={row} />
            ))}
          </dl>

          {remaining > 0 ? (
            <div className="border-t p-2">
              <Button
                className="w-full"
                onClick={() => setShown((current) => current + PAGE_SIZE)}
                size="sm"
                variant="ghost"
              >
                {fill(more, remaining)}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

export const ExpBreakdown = ({
  loading,
  monthly,
  perLessonType,
  standard,
}: ExpBreakdownProps) => {
  const { t } = useI18n();
  const copy = t.learning.breakdown;
  // SAFETY: the dictionary block is a flat string record, and the lookup below
  const labels: Record<string, string | undefined> = copy.types;

  const typeTotal = perLessonType.reduce((sum, row) => sum + (row.exp ?? 0), 0);

  const groups: Group[] = [
    {
      icon: FileTextIcon,
      id: "source",
      label: copy.source,
      rows: [
        {
          id: "standard",
          label: copy.standard.label,
          note: copy.standard.footer,
          value: standard,
        },
        {
          id: "monthly",
          label: copy.monthly.label,
          limit: MONTHLY_TARGET,
          value: monthly,
        },
      ],
      tally: null,
    },
    {
      icon: LayersIcon,
      id: "type",
      label: copy.type,
      rows: perLessonType.map((row) => ({
        id: row.lessonType,
        label: labels[row.lessonType] ?? row.lessonType,
        value: row.exp,
      })),
      tally: perLessonType.length > 0 ? typeTotal.toLocaleString() : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <BreakdownCard
          empty={copy.empty}
          exp={copy.exp}
          group={group}
          key={group.id}
          loading={loading}
          more={copy.more}
        />
      ))}
    </div>
  );
};
