"use client";

import { Highlight } from "@sugar-high/react/core";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ParseOptions, TokenType } from "sugar-high/core";
import * as json from "sugar-high/lang/json";
import * as shell from "sugar-high/lang/shell";
import * as typescript from "sugar-high/lang/typescript";

import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";
import type { SnippetLanguage } from "@/lib/snippets";
import { cn } from "@/lib/utils";

/**
 * The `core` entry takes a grammar object rather than a language name, so the
 * bundle carries only these three and none of the Editor or FileTree code the
 * root entry pulls in.
 */
const GRAMMARS: Record<SnippetLanguage, ParseOptions> = {
  bash: shell,
  json,
  tsx: typescript,
};

/**
 * Tokens are painted with the dashboard's own tokens, so the block follows the
 * theme with no second palette to keep in sync.
 */
const TOKEN_CLASS: Partial<Record<TokenType, string>> = {
  class: "text-chart-3",
  comment: "text-muted-foreground",
  entity: "text-chart-5",
  identifier: "text-foreground",
  jsxliterals: "text-chart-5",
  keyword: "text-brand",
  property: "text-chart-2",
  sign: "text-muted-foreground/80",
  string: "text-chart-3",
};

const COPIED_RESET_MS = 1500;

export interface SnippetBlockProps {
  /** False when there is no session to substitute in. */
  canUseCookie: boolean;
  code: string;
  filename: string;
  language: SnippetLanguage;
  onToggleCookie: () => void;
  usingCookie: boolean;
}

export const SnippetBlock = ({
  canUseCookie,
  code,
  filename,
  language,
  onToggleCookie,
  usingCookie,
}: SnippetBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const outcome = await attempt(() => navigator.clipboard.writeText(code));
    if (!outcome.ok) {
      toast.error("Could not copy. Select the snippet and copy it by hand.");
      return;
    }
    setCopied(true);
    toast.success(`Copied ${filename}`);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <figure className="bg-muted/40 ring-foreground/10 overflow-hidden rounded-xl ring-1">
      <figcaption className="bg-muted/60 flex h-9 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground truncate font-mono text-xs">
          {filename}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {/*
            A toggle, not a reveal. The eye on a password field hides a value
            you would still copy; this swaps what the snippet contains, so it
            says so and reports its state through aria-pressed.
          */}
          <Button
            aria-pressed={usingCookie}
            className={cn("touch-target", usingCookie && "text-warning")}
            disabled={!canUseCookie}
            onClick={onToggleCookie}
            size="xs"
            title={
              canUseCookie
                ? "Write your session cookie into the snippet"
                : "Add a session cookie in Settings first"
            }
            variant="ghost"
          >
            {usingCookie ? <Eye /> : <EyeOff />}
            <span className="hidden sm:inline">My cookie</span>
          </Button>

          <Button
            aria-label={`Copy ${filename}`}
            className="touch-target"
            onClick={handleCopy}
            size="icon-xs"
            variant="ghost"
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
      </figcaption>

      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
        <code>
          <Highlight
            code={code}
            lang={GRAMMARS[language]}
            render={({ lines }) =>
              lines.map((line, lineIndex) => (
                // A source line has no identity but its position, and the list is
                // regenerated wholesale rather than reordered.
                <span className="block" key={lineIndex}>
                  {line.tokens.map((token, tokenIndex) => (
                    <span
                      className={TOKEN_CLASS[token.tokenType]}
                      key={tokenIndex}
                    >
                      {token.value}
                    </span>
                  ))}
                  {line.tokens.length === 0 ? "\n" : null}
                </span>
              ))
            }
          />
        </code>
      </pre>
    </figure>
  );
};
