import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SectionProps {
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}

export const Section = ({
  action,
  badge,
  children,
  className,
  description,
  title,
}: SectionProps) => (
  <section className={cn("space-y-3", className)}>
    <div className="flex min-h-7 items-center justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {badge}
        </div>
        {description ? (
          <p className="text-muted-foreground max-w-[68ch] text-xs text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
    {children}
  </section>
);
