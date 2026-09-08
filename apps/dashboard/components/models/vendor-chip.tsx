import { VENDOR_MARKS } from "@/components/models/vendor-marks";
import { vendorRuleOf } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const initialsOf = (vendor: string): string => {
  const words = vendor.split(" ").filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase();
  }
  return vendor.slice(0, 2).toUpperCase();
};

export interface VendorChipProps {
  className?: string;
  modelId: string;
}

/**
 * The vendor's own mark where one exists, and its initials where none does —
 * both in the same tile, so the column reads as one thing rather than as a
 * logo set with holes in it.
 */
export const VendorChip = ({ className, modelId }: VendorChipProps) => {
  const rule = vendorRuleOf(modelId);
  const entry = rule.slug ? VENDOR_MARKS.get(rule.slug) : undefined;

  return (
    <span
      className={cn(
        "bg-muted text-foreground/85 flex size-6 shrink-0 items-center justify-center rounded-md",
        className
      )}
    >
      {entry?.mark ?? (
        <span aria-hidden="true" className="text-[9px] font-medium">
          {initialsOf(rule.label)}
        </span>
      )}
      <span className="sr-only">{rule.label}</span>
    </span>
  );
};
