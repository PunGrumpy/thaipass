"use client";

import { useConnection } from "@/hooks/use-connection";
import { useHydrated } from "@/hooks/use-hydrated";
import { useResource } from "@/hooks/use-resource";
import type { Resource } from "@/hooks/use-resource";
import { fetchLearningExp } from "@/lib/lms";
import type { LearningExp } from "@/lib/lms";

/**
 * Kept out of GatewayProvider on purpose: only this page reads the LMS, and
 * the provider's job is the endpoints every page shares.
 */
export const useLearning = (): Resource<LearningExp> => {
  const { cookie, proxyUrl } = useConnection();
  const hydrated = useHydrated();
  const key = hydrated && cookie ? `${proxyUrl}:${cookie}` : null;
  return useResource(key, (signal) =>
    fetchLearningExp(proxyUrl, cookie, signal)
  );
};
