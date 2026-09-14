import type { ReactNode } from "react";

import { Mascot } from "@/components/icons/mascot";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

export const EmptyState = ({ children, className }: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center gap-3 px-4 py-10 text-center",
      className
    )}
  >
    <Mascot />
    <p className="text-muted-foreground max-w-[42ch] text-sm text-pretty">
      {children}
    </p>
  </div>
);
