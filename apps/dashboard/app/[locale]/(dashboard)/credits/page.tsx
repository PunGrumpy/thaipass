"use client";

import { forecast, spendOf } from "@thaipass/core/aipass/history";
import type { BurnWindow } from "@thaipass/core/aipass/history";
import { useI18n } from "@thaipass/internationalization";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";

import { CreditChart } from "@/components/credits/credit-chart";
import { CreditStats } from "@/components/credits/credit-stats";
import { SpendBreakdown } from "@/components/credits/spend-breakdown";
import { StoreNotice } from "@/components/credits/store-notice";
import { Section } from "@/components/layout/section";
import { SessionGate } from "@/components/overview/session-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnection } from "@/hooks/use-connection";
import { useCreditHistory } from "@/hooks/use-credit-history";
import { toChartModel } from "@/lib/credit-chart";

const DEFAULT_BURN_WINDOW: BurnWindow = 3;

/**
 * The page owns one piece of state, the burn window. Everything else is
 * derived in render from the polled history, so changing the window never
 * refetches.
 */
const CreditsPage = () => {
  const { hasSession } = useConnection();
  const { locale, t } = useI18n();
  const history = useCreditHistory();
  const [burnWindow, setBurnWindow] = useState<BurnWindow>(DEFAULT_BURN_WINDOW);
  const { credits } = t;

  const timeline = history.data?.timeline ?? null;
  const outlook = useMemo(
    () => (timeline ? forecast(timeline, { burnWindow }) : null),
    [timeline, burnWindow]
  );
  const chart = useMemo(
    () => (timeline && outlook ? toChartModel(timeline, outlook) : null),
    [timeline, outlook]
  );
  const spend = useMemo(
    () => (timeline ? spendOf(timeline) : null),
    [timeline]
  );

  if (!hasSession) {
    return <SessionGate />;
  }

  const store = history.data?.store ?? "ready";
  const recorded = history.data?.store === "ready";
  const modelShares =
    spend && spend.outside > 0
      ? [...spend.byModel, { credits: spend.outside, key: credits.outside }]
      : (spend?.byModel ?? []);

  return (
    <>
      {history.error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{credits.errorTitle}</AlertTitle>
          <AlertDescription>
            {history.error} {credits.errorHint}
          </AlertDescription>
        </Alert>
      ) : null}

      {history.data ? <StoreNotice status={store} /> : null}

      {outlook ? (
        <CreditStats
          burnWindow={burnWindow}
          forecast={outlook}
          onBurnWindowChange={setBurnWindow}
        />
      ) : (
        <Skeleton className="h-24 w-full rounded-xl" />
      )}

      {recorded && chart ? (
        <Section
          badge={
            <span className="text-muted-foreground text-xs">
              {credits.weekNote}
            </span>
          }
          description={credits.description}
          title={credits.sections.chart}
        >
          <div className="rounded-xl border p-3">
            <CreditChart model={chart} />
          </div>
        </Section>
      ) : null}

      {recorded && spend && spend.total > 0 ? (
        <Section description={credits.spendNote} title={credits.sections.spend}>
          <div className="grid gap-4 md:grid-cols-2">
            <SpendBreakdown
              heading={credits.byModel}
              locale={locale}
              shares={modelShares}
              unnamedLabel={credits.outside}
            />
            <SpendBreakdown
              heading={credits.byApp}
              locale={locale}
              shares={spend.byApp}
              unnamedLabel={credits.noApp}
            />
          </div>
        </Section>
      ) : null}
    </>
  );
};

export default CreditsPage;
