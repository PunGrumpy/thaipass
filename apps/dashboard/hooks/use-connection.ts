"use client";

import { useCallback, useSyncExternalStore } from "react";

import { env } from "@/env";
import { readLocal, subscribeLocal, writeLocal } from "@/lib/local-store";
import { normalizeCookie, normalizeProxyUrl } from "@/lib/proxy";

const PROXY_URL_KEY = "thaipass:proxy-url";
const COOKIE_KEY = "thaipass:cookie";

export const DEFAULT_PROXY_URL = env.NEXT_PUBLIC_PROXY_URL;

const LOOPBACK = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u;

export const PROXY_LOCKED =
  env.NEXT_PUBLIC_PROXY_LOCKED === undefined
    ? !LOOPBACK.test(DEFAULT_PROXY_URL)
    : env.NEXT_PUBLIC_PROXY_LOCKED === "1";

export interface Connection {
  proxyLocked: boolean;
  clear: () => void;
  cookie: string;
  hasSession: boolean;
  proxyUrl: string;
  setCookie: (next: string) => void;
  setProxyUrl: (next: string) => void;
}

const readProxyUrl = (): string =>
  PROXY_LOCKED
    ? DEFAULT_PROXY_URL
    : (readLocal(PROXY_URL_KEY) ?? DEFAULT_PROXY_URL);
const serverProxyUrl = (): string => DEFAULT_PROXY_URL;

const readCookie = (): string => readLocal(COOKIE_KEY) ?? "";
const serverCookie = (): string => "";

export const useConnection = (): Connection => {
  const proxyUrl = useSyncExternalStore(
    subscribeLocal,
    readProxyUrl,
    serverProxyUrl
  );
  const cookie = useSyncExternalStore(subscribeLocal, readCookie, serverCookie);

  const setProxyUrl = useCallback((next: string) => {
    if (PROXY_LOCKED) {
      return;
    }
    writeLocal(PROXY_URL_KEY, normalizeProxyUrl(next));
  }, []);

  const setCookie = useCallback((next: string) => {
    writeLocal(COOKIE_KEY, normalizeCookie(next));
  }, []);

  const clear = useCallback(() => {
    writeLocal(COOKIE_KEY, "");
    writeLocal(PROXY_URL_KEY, "");
  }, []);

  return {
    clear,
    cookie,
    hasSession: cookie.length > 0,
    proxyLocked: PROXY_LOCKED,
    proxyUrl,
    setCookie,
    setProxyUrl,
  };
};
