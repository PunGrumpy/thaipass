"use client";

import { useI18n } from "@thaipass/internationalization";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ClientGrid } from "@/components/integrations/client-grid";
import { SetupIllustration } from "@/components/integrations/setup-illustration";
import { SnippetBlock } from "@/components/integrations/snippet-block";
import { SnippetSteps } from "@/components/integrations/snippet-steps";
import { Section } from "@/components/layout/section";
import { ModelSelect } from "@/components/playground/model-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConnection } from "@/hooks/use-connection";
import { useCatalog, useHealth } from "@/hooks/use-gateway";
import { attempt } from "@/lib/attempt";
import { DEFAULT_MODEL } from "@/lib/catalog";
import { fill } from "@/lib/format";
import { mintToken } from "@/lib/oauth";
import type { TokenGrant } from "@/lib/oauth";
import {
  CLIENT_SCOPE,
  COOKIE_PLACEHOLDER,
  SNIPPETS,
  TOKEN_PLACEHOLDER,
} from "@/lib/snippets";
import type { Snippet } from "@/lib/snippets";

const SECONDS_PER_DAY = 86_400;

const expiryOf = (grant: TokenGrant): string => {
  const days = Math.round(grant.expires_in / SECONDS_PER_DAY);
  if (days >= 2) {
    return `expires in ${days} days`;
  }
  return days === 1 ? "expires tomorrow" : "expires within a day";
};

export const IntegrationPanel = () => {
  const { cookie, hasSession, proxyUrl } = useConnection();
  const { models } = useCatalog();
  const health = useHealth();
  const { t } = useI18n();

  const [model, setModel] = useState(DEFAULT_MODEL);
  const [client, setClient] = useState(SNIPPETS[0]?.id ?? "");
  const [reveal, setReveal] = useState(false);
  const [grant, setGrant] = useState<TokenGrant | null>(null);
  const [minting, setMinting] = useState(false);

  const chatModels = useMemo(
    () => models.filter((entry) => entry.kind === "chat"),
    [models]
  );

  const issuesTokens = health.data?.tokens === true;

  const mint = useCallback(
    async (announce = false) => {
      setMinting(true);
      const outcome = await attempt(() =>
        mintToken(proxyUrl, cookie, {
          clientId: "dashboard",
          scope: CLIENT_SCOPE,
        })
      );
      setMinting(false);

      if (!outcome.ok) {
        if (announce) {
          toast.error(outcome.message);
        }
        return;
      }
      setGrant(outcome.data);
      if (announce) {
        toast.success("New token created");
      }
    },
    [cookie, proxyUrl]
  );

  const minted = useRef(false);

  useEffect(() => {
    if (!(issuesTokens && hasSession) || minted.current) {
      return;
    }
    minted.current = true;
    mint();
  }, [hasSession, issuesTokens, mint]);

  const viewOf = (snippet: Snippet) => {
    const usesToken = snippet.target === "gateway" && grant !== null;
    const revealed = reveal && (usesToken || hasSession);
    const secret = usesToken ? grant.access_token : cookie;
    const placeholder = usesToken ? TOKEN_PLACEHOLDER : COOKIE_PLACEHOLDER;

    return {
      code: snippet.code({
        cookie: revealed ? secret : placeholder,
        model,
        proxyUrl,
      }),
      credential: usesToken ? ("token" as const) : ("cookie" as const),
      revealed,
    };
  };

  const selected = SNIPPETS.find((snippet) => snippet.id === client) ?? null;
  const view = selected ? viewOf(selected) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="max-w-xs flex-1 space-y-1.5">
          <Label htmlFor="integration-model">
            {t.integrations.clients.model}
          </Label>
          <ModelSelect
            id="integration-model"
            models={chatModels}
            onChange={setModel}
            value={model}
          />
        </div>

        {issuesTokens && hasSession ? (
          <div className="space-y-1.5">
            <Label>Credential</Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                {minting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <KeyRound className="size-3.5" />
                )}
                {grant === null
                  ? "Making a token for these snippets…"
                  : `thaipass token, scoped ${grant.scope}, ${expiryOf(grant)}`}
              </span>
              <Button
                disabled={minting}
                onClick={() => mint(true)}
                size="xs"
                variant="ghost"
              >
                <RefreshCw />
                New token
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <ClientGrid onSelect={setClient} selected={client} snippets={SNIPPETS} />

      {selected ? (
        <Section title={fill(t.integrations.clients.setup, selected.label)}>
          <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-3">
              <p className="text-muted-foreground max-w-[68ch] text-sm text-pretty">
                {selected.summary}
              </p>
              <SnippetSteps
                block={
                  <SnippetBlock
                    canReveal={hasSession}
                    code={view?.code ?? ""}
                    credential={view?.credential ?? "cookie"}
                    filename={selected.filename}
                    language={selected.language}
                    onToggleReveal={() => setReveal((on) => !on)}
                    revealed={view?.revealed ?? false}
                  />
                }
                steps={selected.steps}
              />
            </div>

            <div className="hidden md:block">
              <SetupIllustration place={selected.place} />
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  );
};
