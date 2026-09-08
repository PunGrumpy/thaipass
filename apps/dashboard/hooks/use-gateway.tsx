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
  /** True when the list is the proxy's built-in ids, not the account's. */
  builtin: boolean;
  models: readonly CatalogModel[];
}

export interface Gateway {
  catalog: CatalogResource;
  credits: Resource<CreditBalance>;
  health: HealthResource;
  /** Reloads all three — what the Refresh button on a page calls. */
  refresh: () => void;
}

const GatewayContext = createContext<Gateway | null>(null);

/**
 * One fetch per endpoint for the whole app. The header, the command menu and
 * the page body all want the same health, quota and catalog, and each is
 * a round trip to someone's local gateway — polled, in health's case. Reading
 * them through a provider is what keeps that at one request instead of one
 * per consumer, and what lets a page's Refresh button update the header too.
 */
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

  // Each reload is a stable callback; naming them keeps `refresh` stable too.
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
