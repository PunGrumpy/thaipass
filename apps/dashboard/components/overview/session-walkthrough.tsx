"use client";

import { MockKey, MockWindow } from "@/components/ui/mock-window";
import { cn } from "@/lib/utils";

const SignInFrame = () => (
  <MockWindow title="de.aipass.net">
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <div className="from-primary size-6 rounded-md bg-gradient-to-b to-sky-400" />
      <div className="bg-muted h-1.5 w-16 rounded-full" />
      <div className="border-primary/40 bg-primary/10 text-primary rounded-full border px-3 py-1 text-[10px] font-medium">
        Sign in
      </div>
    </div>
  </MockWindow>
);

const PANEL_TABS = ["Elements", "Console", "Application"] as const;

const Panel = ({ detailed }: { readonly detailed: boolean }) => (
  <div
    className={cn(
      "bg-muted/40 flex w-[62%] flex-col border-l",
      detailed ? "opacity-100" : "opacity-70"
    )}
  >
    <div className="flex gap-2 border-b px-2 py-1">
      {PANEL_TABS.map((tab) => (
        <span
          className={cn(
            "text-[9px]",
            tab === "Application" && detailed
              ? "text-primary border-primary border-b font-medium"
              : "text-muted-foreground"
          )}
          key={tab}
        >
          {tab}
        </span>
      ))}
    </div>
    {detailed ? (
      <div className="flex min-h-0 flex-1">
        <div className="w-1/3 space-y-1 border-r p-1.5">
          <div className="text-muted-foreground text-[9px]">Cookies</div>
          <div className="text-primary truncate text-[9px] font-medium">
            de.aipass.net
          </div>
        </div>
        <div className="flex-1 space-y-1 p-1.5 pr-2.5">
          <div className="text-muted-foreground flex gap-2 text-[9px]">
            <span className="w-1/2">Name</span>
            <span>Value</span>
          </div>
          <div className="bg-muted-foreground/20 h-1.5 w-full rounded-full" />
          <div className="ring-primary bg-primary/10 flex items-center gap-2 rounded-sm px-1 py-0.5 ring-1">
            <span className="text-primary w-1/2 truncate font-mono text-[8px]">
              __Secure-…session_token
            </span>
            <span className="bg-primary/30 h-1.5 flex-1 rounded-full" />
          </div>
          <div className="bg-muted-foreground/20 h-1.5 w-4/5 rounded-full" />
        </div>
      </div>
    ) : (
      <div className="flex-1 space-y-1.5 p-2">
        <div className="bg-muted-foreground/20 h-1.5 w-2/3 rounded-full" />
        <div className="bg-muted-foreground/20 h-1.5 w-1/2 rounded-full" />
        <div className="bg-muted-foreground/20 h-1.5 w-3/5 rounded-full" />
      </div>
    )}
  </div>
);

const OpenFrame = () => (
  <div className="relative">
    <MockWindow title="de.aipass.net">
      <div className="flex-1" />
      <Panel detailed={false} />
    </MockWindow>
    <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1">
      <MockKey>F12</MockKey>
      <span className="text-muted-foreground text-[10px]">/</span>
      <MockKey>⌥ ⌘ I</MockKey>
    </div>
  </div>
);

const CopyFrame = () => (
  <div className="relative">
    <MockWindow title="de.aipass.net">
      <div className="bg-muted/20 flex-1" />
      <Panel detailed />
    </MockWindow>
    <div className="absolute right-3 bottom-3">
      <MockKey>Ctrl C</MockKey>
    </div>
  </div>
);

const PasteFrame = ({ label }: { readonly label: string }) => (
  <div className="relative">
    <MockWindow title="thaipass.vercel.app">
      <div className="flex flex-1 flex-col justify-center gap-2 px-4">
        <div className="bg-muted h-1.5 w-20 rounded-full" />
        <div className="flex items-center gap-2">
          <div className="bg-muted/60 h-5 flex-1 rounded border" />
          <div className="bg-primary text-primary-foreground ring-primary/30 truncate rounded px-2 py-1 text-[9px] font-medium ring-4">
            {label}
          </div>
        </div>
      </div>
    </MockWindow>
    <div className="absolute bottom-3 left-3">
      <MockKey>Ctrl V</MockKey>
    </div>
  </div>
);

export interface WalkthroughProps {
  readonly index: number;
  readonly pasteLabel: string;
}

export const SessionWalkthrough = ({ index, pasteLabel }: WalkthroughProps) => {
  if (index === 1) {
    return <OpenFrame />;
  }
  if (index === 2) {
    return <CopyFrame />;
  }
  if (index === 3) {
    return <PasteFrame label={pasteLabel} />;
  }
  return <SignInFrame />;
};
