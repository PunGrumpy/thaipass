"use client";

import { useI18n } from "@thaipass/internationalization";
import { Info, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ModelTable } from "@/components/models/model-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";

const ModelsPage = () => {
  const catalog = useCatalog();
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        action={
          <Button
            disabled={catalog.loading}
            onClick={() => catalog.reload()}
            variant="outline"
          >
            <RefreshCw className={cn(catalog.loading && "animate-spin")} />
            {catalog.loading
              ? t.common.actions.refreshing
              : t.common.actions.refresh}
          </Button>
        }
        description={t.models.description}
        title={t.models.title}
      />

      {catalog.builtin && !catalog.loading ? (
        <Alert>
          <Info />
          <AlertTitle>Showing the built-in model list</AlertTitle>
          <AlertDescription>
            {catalog.error ??
              "Connect a session in Settings to load the catalog your account can actually reach, with live availability."}
          </AlertDescription>
        </Alert>
      ) : null}

      <ModelTable models={catalog.models} />
    </>
  );
};

export default ModelsPage;
