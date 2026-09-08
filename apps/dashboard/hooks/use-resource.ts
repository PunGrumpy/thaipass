"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { attempt } from "@/lib/attempt";

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

const IDLE = { data: null, error: null, loading: false } as const;

/**
 * A load keyed by a string. Passing `null` for the key parks the resource —
 * that is how a page says "there is no session yet, do not call the proxy".
 * Re-running is explicit, because every call here costs a round trip to
 * someone's local gateway.
 */
export const useResource = <T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>
): Resource<T> => {
  const [state, setState] = useState<State<T>>(IDLE);
  const loadRef = useRef(load);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState((previous) => ({ ...previous, error: null, loading: true }));
    const result = await attempt(() => loadRef.current(controller.signal));

    if (controller.signal.aborted) {
      return;
    }
    setState(
      result.ok
        ? { data: result.data, error: null, loading: false }
        : { data: null, error: result.message, loading: false }
    );
  }, []);

  const parked = key === null;

  useEffect(() => {
    if (key === null) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- talking to the gateway is the external-system synchronisation effects exist for, and the loading flag has to flip when the key changes.
    void run();
    return () => {
      controllerRef.current?.abort();
    };
  }, [key, run]);

  // Parking is derived rather than stored, so no render is spent clearing state.
  return {
    data: parked ? null : state.data,
    error: parked ? null : state.error,
    loading: parked ? false : state.loading,
    reload: run,
  };
};

/** Calls `reload` on an interval while the tab is visible. */
export const usePolling = (reload: () => void, intervalMs: number): void => {
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        reload();
      }
    };
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [reload, intervalMs]);
};
