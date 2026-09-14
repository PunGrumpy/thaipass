"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Playground } from "@/components/playground/playground";
import { Skeleton } from "@/components/ui/skeleton";

const PlaygroundBody = () => {
  const params = useSearchParams();
  return <Playground initialModel={params.get("model")} />;
};

const PlaygroundPage = () => (
  <Suspense fallback={<Skeleton className="h-96 w-full" />}>
    <PlaygroundBody />
  </Suspense>
);

export default PlaygroundPage;
