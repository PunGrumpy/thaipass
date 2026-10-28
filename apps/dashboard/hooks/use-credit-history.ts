"use client";

import type { CreditHistory } from "@thaipass/core/aipass/history";

import { useConnection } from "@/hooks/use-connection";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePolling, useResource } from "@/hooks/use-resource";
import type { Resource } from "@/hooks/use-resource";
import { fetchCreditHistory } from "@/lib/proxy";

/** Each poll is one live AI Pass read, so keep it modest. */
export const CREDIT_HISTORY_POLL_MS = 60_000;

/**
 * Mounted by the credits page only, not by GatewayProvider, so no other page
 * pays for the read. Polling pauses on a hidden tab, and each poll is also
 * what records a fresh sample on the proxy.
 */
export const useCreditHistory = (): Resource<CreditHistory> => {
  const { cookie, proxyUrl } = useConnection();
  const hydrated = useHydrated();
  const key = hydrated && cookie ? `${proxyUrl}:${cookie}:history` : null;
  const history = useResource(key, (signal) =>
    fetchCreditHistory(proxyUrl, cookie, signal)
  );
  usePolling(history.reload, CREDIT_HISTORY_POLL_MS);
  return history;
};
