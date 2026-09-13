import type { ReactNode } from "react";

import type { SnippetStep } from "@/lib/snippets";

/**
 * A setup read as numbered steps, with the code under the step it belongs to.
 *
 * The page used to be one sentence and one block per client, which says what
 * to copy but not where it goes or what happens after. A reader who has never
 * set up a custom provider needs both, and they are short enough to show
 * rather than link to.
 */

const CODE_RUN = /`(?<code>[^`]+)`/gu;

/** Backticked runs in a step read as code, the way the same sentence would in prose. */
const paint = (text: string): ReactNode[] => {
  const parts: ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(CODE_RUN)) {
    const at = match.index;
    if (at > last) {
      parts.push(text.slice(last, at));
    }
    parts.push(
      <code
        className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-[0.85em]"
        key={at}
      >
        {match.groups?.code}
      </code>
    );
    last = at + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
};

export interface SnippetStepsProps {
  /** Rendered under the step marked with `code`. */
  readonly block: ReactNode;
  readonly steps: readonly SnippetStep[];
}

export const SnippetSteps = ({ block, steps }: SnippetStepsProps) => (
  <ol className="space-y-3">
    {steps.map((step, index) => (
      <li className="flex gap-3" key={step.text}>
        <span className="bg-muted text-muted-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="max-w-[68ch] text-sm text-pretty">{paint(step.text)}</p>
          {step.code ? block : null}
        </div>
      </li>
    ))}
  </ol>
);
