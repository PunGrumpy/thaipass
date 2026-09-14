"use client";

import { useSyncExternalStore } from "react";

const NO_CHANGES = (): (() => void) => () => {
  // Required by no-empty-function.
};

const onClient = (): boolean => true;
const onServer = (): boolean => false;

export const useHydrated = (): boolean =>
  useSyncExternalStore(NO_CHANGES, onClient, onServer);
