"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import { useConnection } from "@/hooks/use-connection";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePolling, useResource } from "@/hooks/use-resource";
import type { Resource } from "@/hooks/use-resource";
import { BUILTIN_CATALOG } from "@/lib/catalog";
import { fetchCatalog, fetchCredits, fetchHealth } from "@/lib/proxy";
import type { CatalogModel, CreditBalance, ProxyHealth } from "@/lib/proxy";

const HEALTH_INTERVAL_MS = 20_000;

export interface HealthResource extends Resource<ProxyHealth> {
  online: boolean;
}

export interface CatalogResource extends Resource<CatalogModel[]> {
  builtin: boolean;
  models: readonly CatalogModel[];
}

export interface Gateway {
  catalog: CatalogResource;
  credits: Resource<CreditBalance>;
  health: HealthResource;
  refresh: () => void;
}

const GatewayContext = createContext<Gateway | null>(null);

export const GatewayProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const { cookie, proxyUrl } = useConnection();
  const hydrated = useHydrated();
  const sessionKey = hydrated && cookie ? `${proxyUrl}:${cookie}` : null;

  const health = useResource(hydrated ? proxyUrl : null, (signal) =>
    fetchHealth(proxyUrl, signal)
  );
  const credits = useResource(sessionKey, (signal) =>
    fetchCredits(proxyUrl, cookie, signal)
  );
  const catalog = useResource(sessionKey, (signal) =>
    fetchCatalog(proxyUrl, cookie, signal)
  );

  const { reload: reloadHealth } = health;
  const { reload: reloadCredits } = credits;
  const { reload: reloadCatalog } = catalog;

  usePolling(reloadHealth, HEALTH_INTERVAL_MS);

  const refresh = useCallback(() => {
    reloadHealth();
    reloadCredits();
    reloadCatalog();
  }, [reloadCatalog, reloadCredits, reloadHealth]);

  const value = useMemo<Gateway>(
    () => ({
      catalog: {
        ...catalog,
        builtin: catalog.data === null,
        models: catalog.data ?? BUILTIN_CATALOG,
      },
      credits,
      health: { ...health, online: health.data?.ok === true },
      refresh,
    }),
    [catalog, credits, health, refresh]
  );

  return <GatewayContext value={value}>{children}</GatewayContext>;
};

export const useGateway = (): Gateway => {
  const value = useContext(GatewayContext);
  if (!value) {
    throw new Error("useGateway must be used inside a GatewayProvider");
  }
  return value;
};

export const useHealth = (): HealthResource => useGateway().health;
export const useCatalog = (): CatalogResource => useGateway().catalog;
