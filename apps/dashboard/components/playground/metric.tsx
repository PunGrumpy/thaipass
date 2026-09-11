"use client";

export interface MetricProps {
  formatted?: string;
  hint?: string;
  label: string;
  unit?: string;
  value: number | null;
}

export const Metric = ({
  formatted,
  hint,
  label,
  unit,
  value,
}: MetricProps) => {
  const display = formatted ?? (value === null ? "—" : value.toLocaleString());
  return (
    <div className="flex flex-col gap-0.5" title={hint}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium tabular-nums">
        {display === "—" ? (
          <span className="text-muted-foreground/50">—</span>
        ) : (
          <>
            {display}
            {unit ? (
              <span className="text-muted-foreground ml-0.5 text-xs font-normal">
                {unit}
              </span>
            ) : null}
          </>
        )}
      </span>
    </div>
  );
};
