"use client";

import { useConnection } from "@/hooks/use-connection";
import { useHydrated } from "@/hooks/use-hydrated";
import { useResource } from "@/hooks/use-resource";
import type { Resource } from "@/hooks/use-resource";
import { fetchCourses } from "@/lib/lms";
import type { LmsCourse } from "@/lib/lms";

export const useCourses = (
  enabled: boolean
): Resource<readonly LmsCourse[]> => {
  const { cookie, proxyUrl } = useConnection();
  const hydrated = useHydrated();
  const key = enabled && hydrated && cookie ? `${proxyUrl}:${cookie}` : null;
  return useResource(key, (signal) => fetchCourses(proxyUrl, cookie, signal));
};
