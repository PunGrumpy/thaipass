"use client";

import { useI18n } from "@thaipass/internationalization";
import { Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DocsIcon } from "@/components/icons/rune";
import { ClientMark, ClientNav } from "@/components/integrations/client-nav";
import { SetupIllustration } from "@/components/integrations/setup-illustration";
import { SnippetBlock } from "@/components/integrations/snippet-block";
import { SnippetSteps } from "@/components/integrations/snippet-steps";
import { ModelSelect } from "@/components/playground/model-select";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConnection } from "@/hooks/use-connection";
import { useCatalog, useHealth } from "@/hooks/use-gateway";
import { attempt } from "@/lib/attempt";
import { DEFAULT_MODEL } from "@/lib/catalog";
import { fill } from "@/lib/format";
import { mintToken } from "@/lib/oauth";
import type { TokenGrant } from "@/lib/oauth";
import { normalizeProxyUrl } from "@/lib/proxy";
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

interface StatProps {
  children?: ReactNode;
  label: string;
  value: string;
}

/** A labelled figure on a card, the way the gateway overview reads. */
const Stat = ({ children, label, value }: StatProps) => (
  <Card className="gap-3 px-5 py-4">
    <div className="min-w-0 space-y-1">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="truncate text-base font-medium">{value}</p>
    </div>
    {children ? (
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        {children}
      </div>
    ) : null}
  </Card>
);

export const IntegrationPanel = () => {
  const { cookie, hasSession, proxyUrl } = useConnection();
  const { models } = useCatalog();
  const health = useHealth();
  const { t } = useI18n();
  const { clients } = t.integrations;

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
  const offersToken = issuesTokens && hasSession;

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
    if (!offersToken || minted.current) {
      return;
    }
    minted.current = true;
    mint();
  }, [mint, offersToken]);

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

  const selected =
    SNIPPETS.find((snippet) => snippet.id === client) ?? SNIPPETS[0];
  if (!selected) {
    return null;
  }
  const view = viewOf(selected);
  const viaGateway = selected.target === "gateway";

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
      <aside className="min-w-0 md:sticky md:top-19 md:self-start">
        <ClientNav
          onSelect={setClient}
          selected={selected.id}
          snippets={SNIPPETS}
        />
      </aside>

      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
              <ClientMark className="size-4.5" snippet={selected} />
            </span>
            <h2 className="truncate text-2xl font-semibold tracking-tight">
              {selected.label}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              className={buttonVariants({ variant: "outline" })}
              href={`${normalizeProxyUrl(proxyUrl)}/`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <DocsIcon data-icon="inline-start" />
              {t.navigation.apiReference}
            </a>
            {offersToken ? (
              <Button disabled={minting} onClick={() => mint(true)}>
                {minting ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}
                {clients.newToken}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="w-full sm:w-64">
          <ModelSelect
            id="integration-model"
            models={chatModels}
            onChange={setModel}
            value={model}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            label={clients.route}
            value={viaGateway ? clients.viaGateway : clients.viaUpstream}
          >
            {viaGateway ? (
              <span className="truncate font-mono">
                {normalizeProxyUrl(proxyUrl)}
              </span>
            ) : null}
            <Badge variant="secondary">{selected.language}</Badge>
          </Stat>

          <Stat
            label={clients.credential}
            value={
              view.credential === "token" ? "thaipass token" : "Session cookie"
            }
          >
            {view.credential === "token" && grant ? (
              <span>
                Scoped {grant.scope}, {expiryOf(grant)}
              </span>
            ) : null}
            {view.credential === "cookie" && offersToken && grant === null ? (
              <span>Making a token for these snippets…</span>
            ) : null}
            {hasSession ? null : <span>Connect a session to fill it in</span>}
          </Stat>
        </div>

        <Card className="gap-5 px-5 py-5">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">
              {fill(clients.setup, selected.label)}
            </h3>
            <p className="text-muted-foreground max-w-[68ch] text-sm text-pretty">
              {selected.summary}
            </p>
          </div>

          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <SnippetSteps
              block={
                <SnippetBlock
                  canReveal={hasSession}
                  code={view.code}
                  credential={view.credential}
                  filename={selected.filename}
                  language={selected.language}
                  onToggleReveal={() => setReveal((on) => !on)}
                  revealed={view.revealed}
                />
              }
              steps={selected.steps}
            />

            <div className="hidden lg:block">
              <SetupIllustration place={selected.place} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
