import { VENDOR_MARKS } from "@/components/models/vendor-marks";
import { vendorRuleOf } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/*
 * Only the marks that are a single shape. The rest carry their brand's own
 * colours inside the SVG, and a vendor whose mark is genuinely monochrome
 * (OpenAI, xAI, Moonshot) keeps `currentColor` so it follows the theme.
 */
const TINTS = {
  anthropic: "var(--vendor-anthropic)",
  pathumma: "var(--vendor-pathumma)",
} satisfies Record<string, string>;

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

export const VendorChip = ({ className, modelId }: VendorChipProps) => {
  const rule = vendorRuleOf(modelId);
  const entry = rule.slug ? VENDOR_MARKS.get(rule.slug) : undefined;
  // SAFETY: the `in` guard above is what narrows the slug to a key of TINTS;
  // a vendor absent from the map falls through to undefined and stays neutral.
  const tint =
    rule.slug && rule.slug in TINTS
      ? TINTS[rule.slug as keyof typeof TINTS]
      : undefined;

  return (
    <span
      className={cn(
        "bg-muted text-foreground/85 flex size-6 shrink-0 items-center justify-center rounded-md",
        className
      )}
      style={tint ? { color: tint } : undefined}
    >
      {entry?.mark ?? (
        <span
          aria-hidden="true"
          className="text-[10px] leading-none font-medium"
        >
          {initialsOf(rule.label)}
        </span>
      )}
      <span className="sr-only">{rule.label}</span>
    </span>
  );
};
