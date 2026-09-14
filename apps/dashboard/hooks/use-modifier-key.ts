"use client";

import { useHydrated } from "@/hooks/use-hydrated";

const APPLE = /mac|iphone|ipad|ipod/iu;

interface UserAgentData {
  platform?: string;
}

const isApple = (): boolean => {
  // SAFETY: userAgentData is Chromium-only, so it is declared optional and the
  const agent = navigator as Navigator & { userAgentData?: UserAgentData };
  const platform =
    agent.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
  return APPLE.test(platform);
};

export const useModifierKey = (): string | null => {
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return isApple() ? "⌘" : "Ctrl ";
};
