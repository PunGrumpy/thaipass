"use client";

import { useI18n } from "@thaipass/internationalization";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Playground } from "@/components/playground/playground";
import { Skeleton } from "@/components/ui/skeleton";

const PlaygroundBody = () => {
  const params = useSearchParams();
  return <Playground initialModel={params.get("model")} />;
};

const PlaygroundPage = () => {
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        description={t.playground.description}
        title={t.playground.title}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PlaygroundBody />
      </Suspense>
    </>
  );
};

export default PlaygroundPage;
