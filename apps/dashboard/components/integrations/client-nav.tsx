"use client";

import { useI18n } from "@thaipass/internationalization";
import { AppWindow, FileCode, TerminalSquare } from "lucide-react";
import { createElement } from "react";
import type { ComponentType } from "react";

import {
  ClaudeCodeMark,
  ClineMark,
  CodexMark,
  CurlMark,
  CursorMark,
  OpenAiMark,
  VercelMark,
} from "@/components/icons/clients";
import type { Snippet, SnippetPlace } from "@/lib/snippets";
import { cn } from "@/lib/utils";

type Mark = ComponentType<{ className?: string }>;

/**
 * The brand mark of the tool a snippet sets up. A snippet without one, such as
 * T3 Code, falls back to the icon for where its setup lives.
 */
const CLIENT_MARKS = new Map<string, Mark>([
  ["ai-sdk", VercelMark],
  ["claude-code", ClaudeCodeMark],
  ["cline", ClineMark],
  ["codex", CodexMark],
  ["curl", CurlMark],
  ["cursor", CursorMark],
  ["openai-sdk", OpenAiMark],
]);

const PLACE_ICONS: Record<SnippetPlace["kind"], Mark> = {
  file: FileCode,
  settings: AppWindow,
  terminal: TerminalSquare,
};

const PLACE_ORDER: readonly SnippetPlace["kind"][] = [
  "terminal",
  "settings",
  "file",
];

const markOf = (snippet: Snippet): Mark =>
  CLIENT_MARKS.get(snippet.id) ?? PLACE_ICONS[snippet.place.kind];

export const ClientMark = ({
  className,
  snippet,
}: {
  readonly className?: string;
  readonly snippet: Snippet;
}) => createElement(markOf(snippet), { className });

export interface ClientNavProps {
  onSelect: (id: string) => void;
  selected: string;
  snippets: readonly Snippet[];
}

/**
 * The clients as a sub-navigation: a column grouped by where the setup lives
 * on wide screens, one scrolling row on narrow ones.
 */
export const ClientNav = ({ onSelect, selected, snippets }: ClientNavProps) => {
  const { t } = useI18n();
  const { clients } = t.integrations;

  const groups = PLACE_ORDER.map((kind) => ({
    items: snippets.filter((snippet) => snippet.place.kind === kind),
    kind,
  })).filter((group) => group.items.length > 0);

  return (
    <fieldset className="-mx-4 flex min-w-0 gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-4 md:overflow-visible md:px-0 md:pb-0">
      <legend className="sr-only">{clients.label}</legend>

      {groups.map((group) => (
        <div className="contents md:block md:space-y-1" key={group.kind}>
          <p className="text-muted-foreground hidden px-2.5 text-[11px] font-medium tracking-wide md:block">
            {clients.groups[group.kind]}
          </p>

          {group.items.map((snippet) => {
            const Icon = markOf(snippet);
            const active = snippet.id === selected;

            return (
              <label
                className={cn(
                  "relative flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm",
                  "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-3",
                  active
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                key={snippet.id}
              >
                <input
                  checked={active}
                  className="sr-only"
                  name="integration-client"
                  onChange={() => onSelect(snippet.id)}
                  type="radio"
                  value={snippet.id}
                />
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{snippet.label}</span>
              </label>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
};
