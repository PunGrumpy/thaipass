import { cn } from "@/lib/utils";

const SIZE = 14;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const FULL_PERCENT = 100;

export interface MeterRingProps {
  className?: string;
  /** `null` where the value has no ceiling: the track is drawn on its own. */
  percent: number | null;
}

/**
 * The share of a ceiling that has been spent, as a ring rather than a number,
 * so a column of them compares at a glance. A row with nothing to measure
 * against keeps the track alone, which is the honest drawing of "no limit".
 */
export const MeterRing = ({ className, percent }: MeterRingProps) => {
  const clamped =
    percent === null ? null : Math.min(FULL_PERCENT, Math.max(0, percent));

  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 -rotate-90", className)}
      fill="none"
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
    >
      <circle
        className="stroke-border"
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        strokeWidth={STROKE}
      />
      {clamped === null ? null : (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="currentColor"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / FULL_PERCENT)}
          strokeLinecap="round"
          strokeWidth={STROKE}
        />
      )}
    </svg>
  );
};
