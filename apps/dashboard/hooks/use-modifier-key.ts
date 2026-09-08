"use client";

import { useHydrated } from "@/hooks/use-hydrated";

const APPLE = /mac|iphone|ipad|ipod/iu;

interface UserAgentData {
  platform?: string;
}

const isApple = (): boolean => {
  // SAFETY: userAgentData is Chromium-only, so it is declared optional and the
  // chain below falls through to platform and then userAgent when it is absent.
  const agent = navigator as Navigator & { userAgentData?: UserAgentData };
  const platform =
    agent.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
  return APPLE.test(platform);
};

/**
 * The label for the command-palette chord. The binding accepts either
 * modifier, so printing ⌘ to a Linux or Windows user names a key they do not
 * have. Null until hydration, so no wrong hint is ever rendered.
 */
export const useModifierKey = (): string | null => {
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return isApple() ? "⌘" : "Ctrl ";
};
