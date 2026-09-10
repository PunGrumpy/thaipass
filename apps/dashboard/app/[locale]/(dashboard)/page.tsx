"use client";

import { useI18n } from "@thaipass/internationalization";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CatalogCard } from "@/components/overview/catalog-card";
import { GatewayCard } from "@/components/overview/gateway-card";
import { SessionGate } from "@/components/overview/session-gate";
import { StatRow } from "@/components/overview/stat-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/use-connection";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";

const OverviewPage = () => {
  const { hasSession } = useConnection();
  const { catalog, credits, health, refresh } = useGateway();
  const { t } = useI18n();

  const refreshing = health.loading || credits.loading || catalog.loading;

  return (
    <>
      <PageHeader
        action={
          <Button disabled={refreshing} onClick={refresh} variant="outline">
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            {refreshing
              ? t.common.actions.refreshing
              : t.common.actions.refresh}
          </Button>
        }
        description={t.overview.description}
        title={t.overview.title}
      />

      {hasSession ? null : <SessionGate />}

      {credits.error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t.overview.balanceError}</AlertTitle>
          <AlertDescription>{credits.error}</AlertDescription>
        </Alert>
      ) : null}

      <StatRow catalog={catalog} credits={credits} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GatewayCard health={health} />
        <CatalogCard models={catalog.models} />
      </div>
    </>
  );
};

export default OverviewPage;
