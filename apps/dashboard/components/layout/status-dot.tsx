import { cn } from "@/lib/utils";

export type StatusTone = "checking" | "offline" | "online";

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
