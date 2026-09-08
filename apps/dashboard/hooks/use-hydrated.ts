"use client";

import { useSyncExternalStore } from "react";

const NO_CHANGES = (): (() => void) => () => {
  // The value only differs between the server pass and the client pass.
};

const onClient = (): boolean => true;
const onServer = (): boolean => false;

/**
 * False while rendering on the server and during hydration, true afterwards.
 * Anything that reads the browser — localStorage, the resolved theme — has to
 * wait for this or the two passes disagree.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(NO_CHANGES, onClient, onServer);
