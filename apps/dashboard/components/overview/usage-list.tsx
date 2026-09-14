import { TriangleAlert } from "lucide-react";

import { MeterRing } from "@/components/ui/meter-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FULL_PERCENT = 100;

export interface UsageRow {
  id: string;
  label: string;
  limit?: number | null;
  note?: string;
  tone?: "default" | "warning";
  value: number | null;
}

export interface UsageListProps {
  caption?: string;
  heading: string;
  loading?: boolean;
  rows: readonly UsageRow[];
}

const shareOf = (row: UsageRow): number | null => {
  if (row.value === null || !row.limit) {
    return null;
  }
  return (row.value / row.limit) * FULL_PERCENT;
};

export const UsageList = ({
  caption,
  heading,
  loading = false,
  rows,
}: UsageListProps) => (
  <div className="overflow-hidden rounded-xl border">
    <div className="text-muted-foreground bg-muted/40 flex items-center justify-between gap-4 border-b px-4 py-2 text-xs font-medium">
      <span>{heading}</span>
      {caption ? <span>{caption}</span> : null}
    </div>

    <dl className="divide-y">
      {rows.map((row) => {
        const share = shareOf(row);
        const warn = row.tone === "warning";

        return (
          <div
            className={cn(
              "flex items-center justify-between gap-4 px-4 py-2.5",
              warn && "bg-warning/5"
            )}
            key={row.id}
          >
            <dt className="flex min-w-0 items-center gap-2.5">
              <MeterRing
                className={warn ? "text-warning" : "text-muted-foreground"}
                percent={share}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm">{row.label}</span>
                {row.note ? (
                  <span className="text-muted-foreground block truncate text-xs">
                    {row.note}
                  </span>
                ) : null}
              </span>
            </dt>

            <dd className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
              {loading && row.value === null ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <>
                  {warn ? (
                    <TriangleAlert className="text-warning size-3.5" />
                  ) : null}
                  <span
                    className={cn(
                      row.value === null && "text-muted-foreground"
                    )}
                  >
                    {row.value === null ? "—" : row.value.toLocaleString()}
                  </span>
                  {row.limit ? (
                    <span className="text-muted-foreground">
                      / {row.limit.toLocaleString()}
                    </span>
                  ) : null}
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  </div>
);
