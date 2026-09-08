import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  /** Rendered under the number: a unit, a share, a reset date. */
  footer?: ReactNode;
  label: string;
  loading?: boolean;
  /** Shown in place of the number when there is nothing to count yet. */
  placeholder?: string;
  suffix?: ReactNode;
  /** "warning" tints the cell for a value that needs attention. */
  tone?: "default" | "warning";
  value: number | null;
}

/**
 * A cell in a shared row rather than a card of its own. Four boxes around four
 * numbers add three borders and no meaning, and the numbers compare better on
 * one baseline than across four surfaces.
 */
export const StatCard = ({
  footer,
  label,
  loading = false,
  placeholder = "—",
  suffix,
  tone = "default",
  value,
}: StatCardProps) => (
  <div
    className={cn(
      "space-y-1.5 px-4 py-3 sm:px-5",
      tone === "warning" ? "bg-warning/10" : "bg-card"
    )}
  >
    <span className="text-muted-foreground block text-xs font-medium">
      {label}
    </span>

    {loading ? (
      <Skeleton className="h-8 w-24" />
    ) : (
      <div
        className={cn(
          "flex items-baseline gap-1.5 text-2xl font-semibold tracking-tight tabular-nums",
          value === null && "text-muted-foreground/50"
        )}
      >
        <span>{value === null ? placeholder : value.toLocaleString()}</span>
        {tone === "warning" ? (
          <TriangleAlert className="text-warning size-4 shrink-0" />
        ) : null}
        {suffix ? (
          <span className="text-muted-foreground text-sm font-normal">
            {suffix}
          </span>
        ) : null}
      </div>
    )}

    <div className="text-muted-foreground min-h-4 text-xs">{footer}</div>
  </div>
);
