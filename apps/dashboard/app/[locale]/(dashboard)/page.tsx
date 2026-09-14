"use client";

import { useI18n } from "@thaipass/internationalization";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/layout/section";
import { CatalogCard } from "@/components/overview/catalog-card";
import { GatewayCard } from "@/components/overview/gateway-card";
import { ModelGrid } from "@/components/overview/model-grid";
import { SessionGate } from "@/components/overview/session-gate";
import { UsageList } from "@/components/overview/usage-list";
import type { UsageRow } from "@/components/overview/usage-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/use-connection";
import { useGateway } from "@/hooks/use-gateway";
import { fill, formatPercent, formatResetAt } from "@/lib/format";
import { normalizeProxyUrl } from "@/lib/proxy";

const LOW_CREDIT_PERCENT = 90;

const OverviewPage = () => {
  const { hasSession, proxyUrl } = useConnection();
  const { catalog, credits, health } = useGateway();
  const { locale, t } = useI18n();
  const { sections, usage } = t.overview;

  const balance = credits.data;
  const percent = balance ? formatPercent(balance.used, balance.limit) : null;
  const low =
    balance !== null &&
    (balance.available === 0 || (percent ?? 0) >= LOW_CREDIT_PERCENT);
  const free = catalog.models.filter((model) => model.free).length;

  const rows: UsageRow[] = [
    {
      id: "credits",
      label: usage.credits,
      limit: balance?.limit ?? null,
      note: balance
        ? fill(usage.creditsNote, formatResetAt(balance.reset_at))
        : usage.noSession,
      tone: low ? "warning" : "default",
      value: balance?.used ?? null,
    },
    {
      id: "models",
      label: usage.models,
      note: catalog.builtin ? usage.modelsNoteBuiltin : usage.modelsNoteLive,
      value: catalog.models.length,
    },
    {
      id: "free",
      label: usage.free,
      note: usage.freeNote,
      value: free,
    },
  ];

  return (
    <>
      {hasSession ? null : <SessionGate />}

      {credits.error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t.overview.balanceError}</AlertTitle>
          <AlertDescription>
            {credits.error} {t.overview.balanceErrorHint}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[22rem_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={sections.usage}>
            <UsageList
              heading={usage.heading}
              loading={credits.loading && !balance}
              rows={rows}
            />
          </Section>

          <Section
            action={
              <Button
                nativeButton={false}
                render={
                  <a
                    aria-label={t.overview.gateway.actionLabel}
                    href={`${normalizeProxyUrl(proxyUrl)}/`}
                    rel="noopener noreferrer"
                    target="_blank"
                  />
                }
                size="sm"
                variant="ghost"
              >
                {t.navigation.apiReference}
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            }
            title={sections.gateway}
          >
            <GatewayCard health={health} />
          </Section>

          <Section title={t.overview.catalog.title}>
            <CatalogCard models={catalog.models} />
          </Section>
        </div>

        <Section
          action={
            <Button
              nativeButton={false}
              render={<Link href={`/${locale}/models`} />}
              size="sm"
              variant="ghost"
            >
              {t.overview.catalog.action}
            </Button>
          }
          className="min-w-0"
          title={sections.models}
        >
          <ModelGrid models={catalog.models} />
        </Section>
      </div>
    </>
  );
};

export default OverviewPage;
