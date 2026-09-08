import type { ReactNode } from "react";

export interface SettingsSectionProps {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
}

/**
 * Settings are a flat form, not a stack of cards. Every group shares this one
 * rhythm, so peers line up on the same heading, description and control
 * baselines instead of each carrying its own surface.
 */
export const SettingsSection = ({
  action,
  children,
  description,
  title,
}: SettingsSectionProps) => (
  <section className="space-y-4">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-medium">{title}</h2>
        {action}
      </div>
      <p className="text-muted-foreground max-w-[68ch] text-sm text-pretty">
        {description}
      </p>
    </div>
    {children}
  </section>
);
