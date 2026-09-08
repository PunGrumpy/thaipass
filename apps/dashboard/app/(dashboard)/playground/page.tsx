"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Playground } from "@/components/playground/playground";
import { Skeleton } from "@/components/ui/skeleton";

const PlaygroundBody = () => {
  const params = useSearchParams();
  return <Playground initialModel={params.get("model")} />;
};

const PlaygroundPage = () => (
  <>
    <PageHeader
      description="Send a prompt through your local gateway and watch how fast the first token comes back."
      title="Playground"
    />
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PlaygroundBody />
    </Suspense>
  </>
);

export default PlaygroundPage;
