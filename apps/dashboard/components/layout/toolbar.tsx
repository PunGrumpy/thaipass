import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ToolbarProps {
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export const Toolbar = ({ actions, children, className }: ToolbarProps) => (
  <div
    className={cn(
      "flex flex-wrap items-center gap-2",
      children ? "justify-between" : "justify-end",
      className
    )}
  >
    {children ? (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {children}
      </div>
    ) : null}
    {actions ? (
      <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);
