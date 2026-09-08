import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const SparkGlyph = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    fill="currentColor"
    viewBox="0 0 24 24"
    {...props}
  >
    <path d="M12 1c.5 6 2.5 8.9 6.5 11-4 2.1-6 5-6.5 11-.5-6-2.5-8.9-6.5-11C9.5 9.9 11.5 7 12 1Z" />
  </svg>
);

export const BrandTile = ({ className, ...props }: ComponentProps<"span">) => (
  <span
    className={cn(
      "text-brand-foreground flex aspect-square size-8 items-center justify-center rounded-lg bg-(image:--brand-gradient)",
      className
    )}
    {...props}
  >
    <SparkGlyph className="size-4.5" />
  </span>
);
