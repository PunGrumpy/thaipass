import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The window every drawing in this dashboard is set inside.
 *
 * Showing a reader the shape of the screen they are about to look at is worth
 * more than another sentence describing it, and two pages now do it: the
 * session walkthrough on the overview, and the setup for each client under
 * Integrations. One frame keeps them the same window rather than two drawings
 * of one.
 */

export type MockChrome = "app" | "browser" | "terminal";

export interface MockWindowProps {
  readonly children: ReactNode;
  /** Browser draws an address bar, terminal a title strip, app a title bar. */
  readonly chrome?: MockChrome;
  readonly className?: string;
  /** The address, the working directory, or the app's name. */
  readonly title: string;
}

/** A keycap, for a step that is a keystroke rather than a click. */
export const MockKey = ({ children }: { readonly children: ReactNode }) => (
  <kbd className="bg-background text-foreground rounded border px-1 py-0.5 font-mono text-[10px] leading-none shadow-sm">
    {children}
  </kbd>
);

export const MockWindow = ({
  children,
  chrome = "browser",
  className,
  title,
}: MockWindowProps) => (
  <div className="bg-background overflow-hidden rounded-md border">
    <div className="bg-muted/60 flex items-center gap-1.5 border-b px-2 py-1.5">
      <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
      <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
      <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
      <span
        className={cn(
          "text-muted-foreground ml-1 flex-1 truncate px-1.5 py-0.5 text-[10px]",
          chrome === "browser" && "bg-background rounded",
          chrome !== "browser" && "text-center font-mono"
        )}
      >
        {title}
      </span>
    </div>
    <div className={cn("flex h-32", className)}>{children}</div>
  </div>
);
