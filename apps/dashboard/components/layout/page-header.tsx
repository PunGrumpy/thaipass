import type { ReactNode } from "react";

export interface PageHeaderProps {
  action?: ReactNode;
  description: string;
  title: string;
}

export const PageHeader = ({ action, description, title }: PageHeaderProps) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="space-y-1">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-[68ch] text-sm text-pretty">
        {description}
      </p>
    </div>
    {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
  </div>
);
