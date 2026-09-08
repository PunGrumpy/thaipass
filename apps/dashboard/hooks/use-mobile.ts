"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * The viewport is an external store, so it is read through
 * `useSyncExternalStore` rather than copied into state by an effect. That also
 * removes the first-render `undefined` the effect version returned.
 */
const subscribe = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const onClient = (): boolean => window.matchMedia(QUERY).matches;
const onServer = (): boolean => false;

export const useIsMobile = (): boolean =>
  useSyncExternalStore(subscribe, onClient, onServer);
