import { MockWindow } from "@/components/ui/mock-window";
import type { SnippetPlace } from "@/lib/snippets";

/**
 * Where a snippet ends up, drawn rather than described.
 *
 * The overview shows a reader the screens they will be looking at while they
 * fetch their session; this is the same idea one page along. Most of the
 * confusion in setting a client up is not what to paste but where it goes —
 * a terminal, a file, or a settings dialog with three fields in it — so the
 * drawing answers that before the steps say it in words.
 */

const Line = ({ width }: { readonly width: string }) => (
  <div className={`bg-muted-foreground/20 h-1.5 rounded-full ${width}`} />
);

const Terminal = ({ run }: { readonly run: string }) => (
  <MockWindow chrome="terminal" className="flex-col gap-1.5 p-2.5" title="zsh">
    <p className="text-muted-foreground font-mono text-[10px]">
      <span className="text-primary">$</span> {run}
    </p>
    <Line width="w-4/5" />
    <Line width="w-2/3" />
    <div className="mt-auto flex items-center gap-1">
      <span className="text-primary font-mono text-[10px]">$</span>
      <span className="bg-foreground/70 inline-block h-3 w-1.5 animate-pulse" />
    </div>
  </MockWindow>
);

const File = ({ name }: { readonly name: string }) => (
  <MockWindow chrome="app" className="flex-col gap-1.5 p-2.5" title={name}>
    <Line width="w-3/5" />
    {/* The line the credential lands on, lit the way the cookie row is on the overview. */}
    <div className="ring-primary bg-primary/10 flex items-center gap-1.5 rounded-sm px-1 py-0.5 ring-1">
      <span className="bg-primary/40 h-1.5 w-1/4 rounded-full" />
      <span className="bg-primary/30 h-1.5 flex-1 rounded-full" />
    </div>
    <Line width="w-4/5" />
    <Line width="w-1/2" />
  </MockWindow>
);

const FIELDS = ["Base URL", "API key", "Model"] as const;

const Settings = ({ app }: { readonly app: string }) => (
  <MockWindow
    chrome="app"
    className="flex-col gap-2 p-2.5"
    title={`${app} · Settings`}
  >
    {FIELDS.map((field) => (
      <div className="space-y-1" key={field}>
        <p className="text-muted-foreground text-[9px]">{field}</p>
        <div
          className={
            field === "API key"
              ? "ring-primary bg-primary/10 h-3 rounded-sm ring-1"
              : "bg-muted/60 h-3 rounded-sm border"
          }
        />
      </div>
    ))}
  </MockWindow>
);

export const SetupIllustration = ({
  place,
}: {
  readonly place: SnippetPlace;
}) => {
  if (place.kind === "terminal") {
    return <Terminal run={place.run} />;
  }
  if (place.kind === "settings") {
    return <Settings app={place.app} />;
  }
  return <File name={place.name} />;
};
