"use client";

export interface MetricProps {
  label: string;
  unit: string;
  value: number | null;
}

export const Metric = ({ label, unit, value }: MetricProps) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-sm font-medium tabular-nums">
      {value === null ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <>
          {value.toLocaleString()}
          <span className="text-muted-foreground ml-0.5 text-xs font-normal">
            {unit}
          </span>
        </>
      )}
    </span>
  </div>
);
