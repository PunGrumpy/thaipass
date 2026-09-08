import { cn } from "@/lib/utils";

export type StatusTone = "checking" | "offline" | "online";

/*
 * Healthy is the state this sits in almost always, so it is monochrome; the
 * word beside it already says "Connected". Colour is kept for the states that
 * want attention, which is what makes it read as a signal when it appears.
 * The reference platform carries no status colour in its sidebar at all.
 */
const TONES = {
  checking: "bg-warning",
  offline: "bg-destructive",
  online: "bg-muted-foreground",
};

export interface StatusDotProps {
  className?: string;
  label: string;
  tone: StatusTone;
}

export const StatusDot = ({ className, label, tone }: StatusDotProps) => (
  <span className={cn("relative flex size-2 shrink-0", className)}>
    <span className={cn("size-2 rounded-full", TONES[tone])} />
    <span className="sr-only">{label}</span>
  </span>
);
