"use client";

import { useI18n } from "@thaipass/internationalization";
import { AppWindow, FileCode, Search, TerminalSquare } from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

import {
  ClaudeCodeMark,
  ClineMark,
  CodexMark,
  CurlMark,
  CursorMark,
  OpenAiMark,
  VercelMark,
} from "@/components/icons/clients";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { fill } from "@/lib/format";
import type { Snippet, SnippetPlace } from "@/lib/snippets";
import { cn } from "@/lib/utils";

type Mark = ComponentType<{ className?: string }>;

/**
 * The brand mark of the tool a snippet sets up. Every snippet has one today; a
 * new one without a mark falls back to the icon for where its setup lives.
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

export interface ClientGridProps {
  onSelect: (id: string) => void;
  selected: string;
  snippets: readonly Snippet[];
}

export const ClientGrid = ({
  onSelect,
  selected,
  snippets,
}: ClientGridProps) => {
  const { t } = useI18n();
  const { clients } = t.integrations;
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return snippets;
    }
    return snippets.filter((snippet) =>
      `${snippet.label} ${snippet.summary}`.toLowerCase().includes(needle)
    );
  }, [query, snippets]);

  const order: SnippetPlace["kind"][] = ["terminal", "settings", "file"];
  const groups = order
    .map((kind) => ({
      items: matches.filter((snippet) => snippet.place.kind === kind),
      kind,
    }))
    .filter((group) => group.items.length > 0);

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">{clients.label}</legend>

      <InputGroup className="max-w-full sm:max-w-xs">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={clients.search}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={clients.search}
          value={query}
        />
      </InputGroup>

      {groups.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border px-4 py-10 text-center text-sm">
          {fill(clients.empty, `"${query.trim()}"`)}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.kind}>
          <h3 className="text-muted-foreground mb-2.5 flex items-center gap-2 text-xs font-medium">
            <span>{clients.groups[group.kind]}</span>
            <span className="tabular-nums">{group.items.length}</span>
          </h3>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((snippet) => {
              const Icon =
                CLIENT_MARKS.get(snippet.id) ?? PLACE_ICONS[snippet.place.kind];
              const active = snippet.id === selected;

              return (
                <label
                  className={cn(
                    "flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors",
                    "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-3",
                    active
                      ? "border-foreground/40 bg-accent"
                      : "hover:border-muted-foreground/30"
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

                  <span className="flex items-center gap-2.5">
                    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                      <Icon className="size-4" />
                    </span>
                    <span className="truncate text-sm font-medium">
                      {snippet.label}
                    </span>
                  </span>

                  <span className="text-muted-foreground min-h-8 text-xs text-pretty">
                    {snippet.summary}
                  </span>

                  <span className="mt-auto flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{snippet.language}</Badge>
                    <Badge variant="outline">
                      {snippet.target === "gateway"
                        ? clients.viaGateway
                        : clients.viaUpstream}
                    </Badge>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </fieldset>
  );
};
