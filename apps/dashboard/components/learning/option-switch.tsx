"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { Switch } from "@/components/ui/switch";

export interface OptionSwitchProps {
  checked: boolean;
  /** What turning this on does to the account, not what the field is called. */
  description: ReactNode;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}

/**
 * Base UI's switch renders a button, and a `<label for>` cannot name one, so
 * the text is bound with aria-labelledby and the consequence with
 * aria-describedby instead.
 */
export const OptionSwitch = ({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: OptionSwitchProps) => {
  const labelId = useId();
  const hintId = useId();

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <span className="block text-sm font-medium" id={labelId}>
          {label}
        </span>
        <p className="text-muted-foreground max-w-[56ch] text-xs" id={hintId}>
          {description}
        </p>
      </div>
      <Switch
        aria-describedby={hintId}
        aria-labelledby={labelId}
        checked={checked}
        className="mt-0.5 shrink-0"
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
};
